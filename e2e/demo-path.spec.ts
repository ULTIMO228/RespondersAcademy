/*
 * Сквозной демо-путь защиты (spec/000-фронт/06-user-flows.md «Демо-путь для защиты», ≤ 5 минут):
 *   шаг 1 (0:00–0:30) — вход преподавателя, предпросмотр и утверждение сценария s-032;
 *   шаг 2 (0:30–1:00) — мастер занятия ([ДТП, Горхоз], группа из 3 курсантов) и старт;
 *   шаг 3 (1:00–3:30) — курсант: поступление c-095, статусы, звонок точке C 301, ручной ввод, итог;
 *   шаг 4 (3:30–4:30) — мониторинг преподавателя и вторая карточка (многозадачность);
 *   шаг 5 (4:30–5:00) — завершение занятия, отчёт и экспорт PDF.
 *
 * Два контекста браузера (преподаватель + курсант) живут на весь прогон, шаги идут строго по порядку.
 * Мок-стор — в памяти процесса: занятие каждого прогона создаётся заново, а занятия сида преподаватель
 * завершает в подготовке (шаг 0), иначе дашборд показывает не своё занятие.
 */
import { statSync } from "node:fs";

import { expect, test } from "@playwright/test";
import type { BrowserContext, Locator, Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";
import {
  DEMO_CALL,
  DEMO_CARD,
  DEMO_CATEGORIES,
  DEMO_DISPATCHER_TEXT,
  DEMO_DUTY_NUMBER,
  DEMO_FINAL_STATUS,
  DEMO_GROUP,
  DEMO_GROUP_MATES,
  DEMO_REFUSE_STATUS,
  DEMO_SCENARIO,
  DEMO_SECOND_CARD,
  DEMO_STATUS_CYCLE,
  DEMO_STUDENT,
  DEMO_TYPO,
  PRIMARY_REACTION_SEC,
} from "./helpers/demo-data";
import { finishRunningSessions, openStatusForm, pickStatus, sessionRow, setStatus } from "./helpers/steps";

/** Темп выдачи второй карточки занятия курсанту по назначенному модулю — 3 мин (норматив отработки). */
const SECOND_CARD_TIMEOUT_MS = 230_000;

test.describe.configure({ mode: "serial" });

test.describe("Демо-путь защиты", () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacher: Page;
  let student: Page;
  let sessionId = "";

  test.beforeAll(async ({ browser }) => {
    /* Контексты создаются вручную, поэтому параметры экрана и локали задаются явно (как в конфиге). */
    const options = {
      viewport: { width: 1920, height: 1080 },
      locale: "ru-RU",
      timezoneId: "Europe/Moscow",
      acceptDownloads: true,
    };
    teacherContext = await browser.newContext(options);
    studentContext = await browser.newContext(options);
    teacher = await teacherContext.newPage();
    student = await studentContext.newPage();
  });

  test.afterAll(async () => {
    await teacherContext.close();
    await studentContext.close();
  });

  test("шаг 0 — подготовка: преподаватель входит и завершает ранее идущие занятия", async () => {
    await loginAs(teacher, "teacher");
    await finishRunningSessions(teacher);
    await expect(teacher.getByRole("heading", { name: "Занятие не идёт" })).toBeVisible();
  });

  test("шаг 1 — фильтр по категории ДТП, предпросмотр эталона и утверждение s-032", async () => {
    await teacher.goto("/teacher/scenarios");
    await expect(teacher.getByRole("heading", { level: 1, name: "Сценарии и эталоны" })).toBeVisible();

    /* Фильтр по категории событий (группа ЕКП «ДТП с пострадавшими»). */
    const filters = teacher.getByRole("search", { name: "Фильтры сценариев" });
    await filters.getByRole("button", { name: "все группы ЕКП" }).click();
    await filters
      .getByRole("list", { name: "Категория событий (группы ЕКП)" })
      .getByText(DEMO_CARD.group, { exact: true })
      .click();
    await expect(filters.getByRole("button", { name: /выбрано: 1/ })).toBeVisible();

    const row = teacher.getByRole("row").filter({ hasText: DEMO_SCENARIO.title });
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "изменить" }).click();
    await teacher.waitForURL(`**/teacher/scenarios/${DEMO_SCENARIO.id}`);

    /* Предпросмотр с подсветкой эталона (Etalon.keyPhrases / expectedActions). */
    await expect(teacher.getByRole("heading", { name: DEMO_SCENARIO.title })).toBeVisible();
    await expect(teacher.getByText("ОЖИДАЕМАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ДЕЙСТВИЙ")).toBeVisible();
    await expect(
      teacher.getByText("Ключевые фразы (подсвечены — правильные по мнению системы)"),
    ).toBeVisible();
    await expect(teacher.getByText(`учебная ситуация ${DEMO_CARD.id}`)).toBeVisible();

    /* Возвращаем сценарий на проверку и утверждаем — прогон не зависит от статуса из сида. */
    const decision = teacher.getByText("Решение преподавателя:");
    await teacher.getByRole("button", { name: "На проверку" }).click();
    await expect(decision).toContainText("на проверке");
    await teacher.getByRole("button", { name: "Утвердить полностью" }).click();
    await expect(decision).toContainText("утверждён");

    /* В каталоге статус тоже «утверждён», сценарий доступен для назначения в занятие. */
    await teacher.goto("/teacher/scenarios");
    const catalogRow = teacher.getByRole("row").filter({ hasText: DEMO_SCENARIO.title });
    await expect(catalogRow).toContainText("утверждён");
    await expect(catalogRow.getByRole("link", { name: "в занятие" })).toBeVisible();
  });

  test("шаг 2 — мастер занятия: категории, группа из 3 курсантов, старт", async () => {
    await teacher.goto("/teacher/session");
    await expect(teacher.getByRole("heading", { name: "Настройка занятия" })).toBeVisible();

    /* Негатив: без выбранных курсантов старт недоступен с пояснением. */
    const startButton = teacher.getByRole("button", { name: "Начать занятие" });
    await expect(startButton).toBeDisabled();
    await expect(teacher.locator("#wizard-start-reason")).toContainText("курсант");

    /* Шаг 1 — учебная группа и три курсанта. */
    await teacher.getByLabel("Учебная группа").selectOption(DEMO_GROUP);
    for (const fullName of [DEMO_STUDENT.fullName, ...DEMO_GROUP_MATES]) {
      await teacher.locator("label").filter({ hasText: fullName }).getByRole("checkbox").check();
    }

    /* Шаг 2 — категории событий [ДТП, Горхоз] (множественный выбор). */
    const groups = teacher.getByRole("list", { name: "Группы происшествий ЕКП" });
    for (const category of DEMO_CATEGORIES) {
      await groups.getByRole("checkbox", { name: category, exact: true }).check();
    }

    /* Шаг 3 — cardSource: generated; шаг 4 — сценарий демо-пути. */
    await teacher.getByRole("radio", { name: /сгенерированные системой/ }).check();
    await teacher.getByRole("checkbox", { name: `Выбрать: ${DEMO_SCENARIO.title}` }).check();

    await expect(startButton).toBeEnabled();
    await expect(teacher.locator("#wizard-start-reason")).toContainText("Курсантов: 3");
    await startButton.click();

    /* Старт → Session.state: running, на дашборде виден индикатор идущего занятия. */
    await teacher.waitForURL(/\/teacher(\?|$)/);
    await expect(teacher.getByText("Идёт занятие")).toBeVisible();
    await expect(teacher.getByRole("button", { name: "Завершить занятие" })).toBeVisible();
    await expect(teacher.getByRole("link", { name: new RegExp(DEMO_STUDENT.shortName) })).toBeVisible();
    sessionId = await readSessionId(teacher);
    expect(sessionId).not.toBe("");
  });

  test("шаг 3а — вход курсанта и поступление карточки c-095 с таймером 30 сек", async () => {
    await loginAs(student, "student");
    await expect(student.getByRole("heading", { name: "Поиск происшествий" })).toBeVisible();

    /* Назначенный преподавателем модуль → занятие курсанта и лента профильных карточек. */
    const module = student.getByRole("button", { name: new RegExp(`^${DEMO_SCENARIO.shortTitle}`) });
    await expect(module).toBeVisible();
    await module.click();

    /* Поступившая карточка: строка ленты занятия с живым таймером первичной реакции. */
    const row = sessionRow(student, DEMO_CARD.id);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText(DEMO_CARD.group);
    await expect(student.getByText("новые карточки")).toBeVisible();

    const timer = row.getByRole("timer");
    await expect(timer).toBeVisible();
    const remaining = await readTimerSeconds(timer);
    expect(remaining).not.toBeNull();
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(PRIMARY_REACTION_SEC);

    /* Открытие карточки: статус службы «Получена службой» проставляется автоматически. */
    await student.goto(`/arm/card/${DEMO_CARD.id}`);
    await expect(student.getByLabel("Действие диспетчера")).toBeVisible({ timeout: 30_000 });
    await expect(student.getByText("Получена службой").first()).toBeVisible();
    /* При открытой карточке линия телефонии занята (spec/000-фронт/04-pages/03 «Поведение»). */
    await expect(student.getByRole("button", { name: /Статус телефонии: недоступен/ })).toBeVisible();
  });

  test("шаг 3б — полный цикл статусов реагирования и блокирующая валидация", async () => {
    /* Негатив: пункт не по порядку недоступен (граф статусов 05-data-models.md). */
    await openStatusForm(student);
    const form = student.getByRole("form", { name: "Смена статуса реагирования" });
    const statusToggle = form.getByRole("button", { name: "Статус", exact: true });
    await statusToggle.click();
    await expect(form.getByRole("option", { name: "Прибытие", exact: true })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await statusToggle.click();
    await form.getByRole("button", { name: "Отмена (Esc)" }).click();
    await expect(form).toBeHidden();

    await setStatus(student, DEMO_STATUS_CYCLE[0], { dutyNumber: DEMO_DUTY_NUMBER });
    await setStatus(student, DEMO_STATUS_CYCLE[1]);
    await setStatus(student, DEMO_STATUS_CYCLE[2]);
    await setStatus(student, DEMO_STATUS_CYCLE[3], { comment: "Бригады на месте, разлив локализуется" });

    /* Негатив: «Отказ от выполнения работ» без комментария не сохраняется. */
    await openStatusForm(student);
    const refuse = await pickStatus(student, DEMO_REFUSE_STATUS);
    await expect(refuse.getByRole("button", { name: "Сохранить статус (Enter)" })).toBeDisabled();
    await expect(
      student.getByText(`Для статуса «${DEMO_REFUSE_STATUS}» комментарий обязателен`),
    ).toBeVisible();
    await refuse.getByRole("button", { name: "Отмена (Esc)" }).click();
    await expect(refuse).toBeHidden();
    await expect(student.getByText(DEMO_STATUS_CYCLE[3]).first()).toBeVisible();
  });

  test("шаг 3в — звонок точке C на внутренний 301 и запись в журнал вызовов", async () => {
    await student.goto(`/arm/phone?cardId=${DEMO_CARD.id}`);
    await expect(student.getByRole("heading", { name: "Софтфон" })).toBeVisible();
    await expect(student.getByText(`Тел.: ${DEMO_CALL.number}`)).toBeVisible();

    await student.getByRole("tab", { name: "Набор" }).click();
    await student.getByLabel("Номер абонента").fill(DEMO_CALL.number);
    await student.getByRole("button", { name: "Позвонить" }).click();

    /* Мок-эмуляция контура B→C: приветствие ИИ-абонента → реплика диспетчера → подтверждение. */
    await expect(student.getByText(DEMO_CALL.greeting)).toBeVisible({ timeout: 30_000 });
    await student.getByLabel("Реплика диспетчера").fill(DEMO_CALL.dispatcherLine);
    await student.getByRole("button", { name: "Отправить" }).click();
    await expect(student.getByText(DEMO_CALL.dispatcherLine)).toBeVisible();
    await expect(student.getByText(DEMO_CALL.farewell)).toBeVisible({ timeout: 30_000 });

    await student.getByRole("button", { name: "Завершить" }).click();
    await expect(student.getByText("Завершён")).toBeVisible({ timeout: 30_000 });

    /* Вызов зафиксирован в журнале вызовов с привязкой к карточке демо-пути. */
    const logRow = student
      .getByRole("table", { name: "Журнал вызовов" })
      .getByRole("row")
      .filter({ hasText: DEMO_CARD.number })
      .first();
    await expect(logRow).toContainText(DEMO_CALL.number);
    await expect(logRow).toContainText(DEMO_CALL.title);
  });

  test("шаг 3г — ручной ввод с опечаткой, «Работы завершены» и мок-разбор грамматики", async () => {
    await student.goto(`/arm/card/${DEMO_CARD.id}`);
    const action = student.getByLabel("Действие диспетчера");
    await expect(action).toBeVisible({ timeout: 30_000 });
    await action.fill(DEMO_DISPATCHER_TEXT);
    await expect(student.getByText("Черновик сохранён")).toBeVisible({ timeout: 30_000 });

    await setStatus(student, DEMO_FINAL_STATUS, { isFinal: true });

    /* Экран итога попытки: мок-оценка с бейджем «ИИ» и ровно одной ошибкой орфографии. */
    const result = student.getByRole("region", { name: "Итог попытки" });
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(result.getByText("ИИ").first()).toBeVisible();
    const grammarIssues = result.getByRole("listitem").filter({ hasText: "Грамматика:" });
    await expect(grammarIssues).toHaveCount(1);
    await expect(grammarIssues.first()).toContainText(`«${DEMO_TYPO.wrong}» → «${DEMO_TYPO.expected}»`);
  });

  test("шаг 4 — мониторинг преподавателя и вторая карточка у курсанта", async () => {
    test.setTimeout(SECOND_CARD_TIMEOUT_MS + 60_000);

    /* Зеркало экрана курсанта — только просмотр: все контролы ввода недоступны. */
    await teacher.goto(`/teacher/monitor/${DEMO_STUDENT.id}`);
    await expect(
      teacher.getByRole("heading", { name: new RegExp(`Экран курсанта: ${DEMO_STUDENT.shortName}`) }),
    ).toBeVisible();
    await expect(teacher.getByText("только просмотр", { exact: true })).toBeVisible();
    const mirror = teacher.getByRole("group", { name: "Зеркало экрана курсанта — только просмотр" });
    await expect(mirror).toBeVisible();
    /* `fieldset disabled` гарантирует, что ни один контрол ввода зеркала не активен (ТЗ §8). */
    await expect(mirror).toHaveAttribute("disabled", "");
    const mirrorControls = mirror.locator("button, input, textarea, select");
    const controlCount = await mirrorControls.count();
    expect(controlCount).toBeGreaterThan(0);
    for (let index = 0; index < controlCount; index += 1) {
      await expect(mirrorControls.nth(index)).toBeDisabled();
    }

    /* Вторая карточка занятия: своя строка и свой таймер 30 сек, первая карточка из списка не исчезает. */
    await student.goto("/arm");
    const secondRow = sessionRow(student, DEMO_SECOND_CARD.id);
    await expect(secondRow).toBeVisible({ timeout: SECOND_CARD_TIMEOUT_MS });
    await expect(secondRow.getByRole("timer")).toBeVisible();
    await expect(sessionRow(student, DEMO_CARD.id)).toBeVisible();
  });

  test("шаг 5 — завершение занятия, отчёт и экспорт PDF", async () => {
    await teacher.goto("/teacher");
    await teacher.getByRole("button", { name: "Завершить занятие" }).click();
    await teacher.getByRole("button", { name: "Завершить", exact: true }).click();
    await expect(teacher.getByLabel("Занятие завершено")).toBeVisible();
    await teacher.getByRole("link", { name: "Сформировать отчёт" }).click();
    await teacher.waitForURL(/\/teacher\/reports\//);

    /* Отчёт: тайминги, отклонения, грамматика, интегральный балл, график и «сформирован за N сек». */
    await expect(teacher.getByRole("heading", { name: /Отчёт о практическом занятии/ })).toBeVisible();
    await expect(teacher.getByText(/Отчёт сформирован за \d+ сек/)).toBeVisible();
    const summary = teacher.getByRole("table", { name: "Сводная таблица по курсантам" });
    const studentRow = summary.getByRole("row").filter({ hasText: DEMO_STUDENT.fullName });
    await expect(studentRow).toBeVisible();
    /* Тайминги и отклонения от нормативов, 1 грамматическая ошибка и интегральный балл. */
    const cells = (await studentRow.getByRole("cell").allInnerTexts()).map((cell) => cell.trim());
    const [reaction, processing, grammar, total] = cells.slice(-4);
    expect(reaction).toMatch(/\d+\s*−\d+ с/);
    expect(processing).toMatch(/\d+\s*−\d+ с/);
    expect(grammar).toBe("1");
    expect(Number(total)).toBeGreaterThan(0);

    /* Детализация попытки: карточка демо-пути, разбор грамматики и графики отчёта. */
    await expect(teacher.getByText(`Происшествие ${DEMO_CARD.number}`).first()).toBeVisible();
    await expect(teacher.getByText("грамматика: орфография").first()).toBeVisible();
    await expect(teacher.getByText(DEMO_TYPO.wrong).first()).toBeVisible();
    await expect(teacher.getByRole("heading", { name: "7. Графики и диаграммы" })).toBeVisible();

    /* CSV — настоящее событие загрузки сводной таблицы отчёта. */
    const csvPromise = teacher.waitForEvent("download");
    await teacher.getByRole("button", { name: "Скачать CSV" }).click();
    const csv = await csvPromise;
    const csvPath = await csv.path();
    expect(csvPath).not.toBeNull();
    expect(statSync(csvPath).size).toBeGreaterThan(0);

    /*
     * PDF отчёта — системная печать («Сохранить как PDF», print-вёрстка), поэтому событие загрузки
     * браузер не отдаёт: проверяем вызов печати и то, что печатная страница получается непустой.
     */
    await teacher.evaluate(() => {
      const target = window as unknown as { print: () => void; __printCalled?: boolean };
      target.__printCalled = false;
      target.print = () => {
        target.__printCalled = true;
      };
    });
    await teacher.getByRole("button", { name: "Скачать PDF" }).click();
    expect(
      await teacher.evaluate(() => (window as unknown as { __printCalled?: boolean }).__printCalled),
    ).toBe(true);

    const pdf = await teacher.pdf({ format: "A4", printBackground: true });
    expect(pdf.byteLength).toBeGreaterThan(1024);
  });
});

/** Идентификатор идущего занятия из подзаголовка дашборда («ID ses-… · режим …»). */
async function readSessionId(page: Page): Promise<string> {
  const text = await page
    .getByText(/ID ses-/)
    .first()
    .innerText();
  return text.match(/ID (\S+)/)?.[1] ?? "";
}

/** Остаток на таймере норматива («0:27» → 27); таймер идёт от CardFlowItem.issuedAt вниз. */
async function readTimerSeconds(timer: Locator): Promise<number | null> {
  const match = (await timer.innerText()).match(/(\d+):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
