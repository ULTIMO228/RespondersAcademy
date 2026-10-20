import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";

/*
 * Сквозной путь конструктора сценариев 112 (spec/005-scenario-graph-builder, этап S8) на стенде с бэкендом:
 * преподаватель собирает граф на холсте → сохраняет → открывает заново → отправляет на проверку;
 * эксперт (преподаватель с правами scenario.review/publish) принимает и публикует; преподаватель создаёт новую версию;
 * преподаватель назначает опубликованный сценарий; обучающийся проходит его, результат сохраняется и виден обоим.
 *
 * Запуск: backend/scripts/run_frontend_e2e.sh --only scenario-graph (нужны чистая БД и источник e2e-graph-source).
 */
test.skip(process.env.E2E_BACKEND !== "1", "нужен стенд с бэкендом (E2E_BACKEND=1)");

const AUTHOR = { login: "morozova", password: "teacher112" };
const EXPERT = { login: "kovalev", password: "teacher112" };
const ADMIN = { login: "admin", password: "admin112" };
const STUDENT = { login: "ivanov", password: "student112" };

async function login(page: Page, who: { login: string; password: string }, landing: RegExp) {
  await page.goto("/login");
  await page.getByLabel(/Логин/i).fill(who.login);
  await page.getByLabel(/Пароль/i).fill(who.password);
  await page.getByRole("button", { name: /Войти/i }).click();
  await page.waitForURL(landing);
}

async function openAs(browser: Browser, who: { login: string; password: string }, landing: RegExp) {
  const context = await browser.newContext({ locale: "ru-RU", viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  await login(page, who, landing);
  return { context, page };
}

const graphOf = (page: Page) => page.getByRole("region", { name: "Граф сценария" });
const block = (page: Page, id: string) =>
  graphOf(page).locator(`[aria-label*="идентификатор ${id}"]`).first();

test("конструктор: создать → собрать → сохранить → опубликовать → пройти", async ({ browser }) => {
  test.setTimeout(240_000);
  const author = await openAs(browser, AUTHOR, /teacher/);
  const page = author.page;
  let scenarioId = "";
  const title = `Упавшее дерево: оценка угрозы ${Date.now()}`; // уникально: в базе могут быть сценарии прошлых прогонов

  await test.step("преподаватель создаёт сценарий из утверждённого источника", async () => {
    await page.goto("/teacher/scenarios/s-001");
    await page.getByRole("tab", { name: "Граф" }).click();
    await page.getByLabel("Источник (очищенный билет)").selectOption({ index: 1 });
    await page.getByLabel("Заголовок (необязательно)").fill(title);
    await page
      .getByLabel("Краткое описание ситуации")
      .fill("Дерево упало на проезжую часть, заявитель на месте");
    await page.getByRole("button", { name: "Создать граф" }).click();
    await page.waitForURL(/\/teacher\/scenarios\/s-\d+\?tab=graph/);
    scenarioId = /scenarios\/(s-\d+)/.exec(page.url())![1];
    await expect(graphOf(page).getByText("Версия 1: Черновик")).toBeVisible();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  });

  await test.step("собирает граф на холсте: шаг с выбором, условие, два завершения", async () => {
    const graph = graphOf(page);
    await graph.getByRole("button", { name: "+ Условие" }).click(); // cond1
    await graph.getByLabel("Заголовок").fill("Есть угроза людям?");
    await graph.getByLabel("Имя ветки", { exact: true }).fill("Угроза");
    await graph.getByLabel("Факт", { exact: true }).fill("risk");
    await graph.getByLabel("Операция").selectOption("eq");
    await graph.getByLabel("Значение", { exact: true }).fill("high");
    await graph.getByLabel("Имя ветки «иначе»").fill("Угрозы нет");
    await graph.getByLabel("Куда ведёт «иначе»").selectOption("end1");

    await graph.getByRole("button", { name: "+ Завершение" }).click(); // end2
    await graph.getByLabel("Заголовок").fill("Эвакуация организована");
    await graph.getByLabel("Исход (outcome)").fill("evacuated");
    await graph.getByLabel("Баллы за завершение (0–100)").fill("100");

    await block(page, "cond1").click();
    await graph.getByLabel(/Куда ведёт ветка/).selectOption("end2");

    await block(page, "end1").click();
    await graph.getByLabel("Заголовок").fill("Наблюдение за местом");
    await graph.getByLabel("Исход (outcome)").fill("observed");
    await graph.getByLabel("Баллы за завершение (0–100)").fill("80");

    await block(page, "step1").click();
    await graph.getByLabel("Заголовок").fill("Оценка обстановки");
    await graph
      .getByLabel("Текст для обучающегося (prompt)")
      .fill("Заявитель сообщает, что дерево упало на дорогу. Оцените обстановку.");
    await graph.getByLabel("Код действия").fill("assessScene");
    await graph.getByLabel("Подпись кнопки").fill("Оценить обстановку");
    await graph.getByLabel("Следующий блок").selectOption("cond1");
    await graph.getByLabel(/Обучающийся выбирает вариант ответа/).click();
    await graph.getByLabel("Факт, который задаёт выбор").fill("risk");
    await graph.getByLabel("Значение варианта 1").fill("high");
    await graph.getByLabel("Подпись варианта 1").fill("Есть угроза людям");
    await graph.getByLabel("Значение варианта 2").fill("low");
    await graph.getByLabel("Подпись варианта 2").fill("Угрозы нет");
    await graph.getByLabel("Штраф варианта 2 (0–100)").fill("10");

    await graph.getByRole("button", { name: "Добавить лишнюю кнопку" }).click();
    await graph.getByLabel("Код лишнего действия 1").fill("callPolice");
    await graph.getByLabel("Подпись лишней кнопки 1").fill("Вызвать полицию");

    await graph.getByRole("button", { name: "Проверить на сервере" }).click();
    await expect(graph.getByText("Сервер не нашёл ошибок в графе.")).toBeVisible();
  });

  await test.step("сохраняет новую версию и открывает сценарий заново: граф на месте", async () => {
    const graph = graphOf(page);
    await graph.getByRole("button", { name: "Сохранить" }).click();
    await expect(graph.getByText(/Версия 2: Черновик/)).toBeVisible();
    await page.reload();
    await expect(graphOf(page).getByText(/Версия 2: Черновик/)).toBeVisible();
    for (const id of ["step1", "cond1", "end1", "end2"]) await expect(block(page, id)).toBeVisible();
    await expect(block(page, "step1")).toContainText("Оценка обстановки");
  });

  await test.step("отправляет на проверку; автор не может принять свою версию", async () => {
    const graph = graphOf(page);
    await graph.getByRole("button", { name: "Отправить на проверку" }).click();
    await expect(graph.getByText(/Версия 2: На проверке/)).toBeVisible();
    await expect(graph.getByRole("button", { name: "Принять" })).toHaveCount(0);
    await expect(graph.getByRole("button", { name: "Опубликовать" })).toHaveCount(0);
  });

  await test.step("администратор выдаёт права эксперта преподавателю kovalev", async () => {
    const admin = await openAs(browser, ADMIN, /admin/);
    const users = await (await admin.page.request.get("/api/mock/admin/users")).json();
    const expert = (users.items ?? users).find((user: { login: string }) => user.login === EXPERT.login);
    const grant = await admin.page.request.put(`/api/v1/admin/users/${expert.id}/permissions`, {
      data: { permissions: ["scenario.review", "scenario.publish"] },
    });
    expect(grant.ok()).toBeTruthy();
    await admin.context.close();
  });

  await test.step("эксперт принимает и публикует версию", async () => {
    const expert = await openAs(browser, EXPERT, /teacher/);
    await expert.page.goto(`/teacher/scenarios/${scenarioId}?tab=graph`);
    const graph = graphOf(expert.page);
    await expect(graph.getByText(/Версия 2: На проверке/)).toBeVisible();
    await graph.getByLabel(/Комментарий эксперта/).fill("Маршруты и баллы проверены");
    await graph.getByRole("button", { name: "Принять" }).click();
    await expect(graph.getByRole("button", { name: "Опубликовать" })).toBeVisible();
    await graph.getByRole("button", { name: "Опубликовать" }).click();
    await expect(graph.getByText(/Версия 2: Опубликован/)).toBeVisible();
    await expert.context.close();
  });

  await test.step("автор создаёт новую версию из опубликованной; версия 2 не меняется", async () => {
    await page.reload();
    const graph = graphOf(page);
    await expect(graph.getByText(/Версия 2: Опубликован/)).toBeVisible();
    await graph.getByRole("button", { name: "Создать новую версию" }).click();
    await expect(graph.getByText(/Версия 3: Черновик/)).toBeVisible();
    await expect(block(page, "cond1")).toBeVisible(); // граф скопирован
    const old = await (await page.request.get(`/api/v1/ai/scenarios/${scenarioId}/versions/2`)).json();
    expect(old.approval).toBe("approved");
  });

  await test.step("преподаватель назначает опубликованную версию 2 обучающемуся через мастер заданий", async () => {
    // версия 3 — черновик, но назначается именно опубликованная версия 2
    await page.goto("/teacher/assignments/new");
    await page.getByLabel(/Иванов Сергей Петрович/).check();
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("button", { name: "Далее" }).click(); // режим и формат: по умолчанию специалист 112 / тренировка
    const row = page.getByRole("checkbox", { name: new RegExp(title) });
    await expect(row).toBeVisible();
    await row.click();
    await expect(row).toBeChecked();
    await expect(page.getByText(/версия 2/).first()).toBeVisible();
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("button", { name: "Далее" }).click();
    await page.getByRole("button", { name: "Создать задание" }).click();
    await page.waitForURL(/\/teacher\/assignments\/asg-\d+/);
    await expect(page.getByRole("heading", { name: /Задание asg-\d+/ })).toBeVisible();
  });

  await test.step("обучающийся проходит сценарий: неверное действие штрафуется, результат сохраняется", async () => {
    const student = await openAs(browser, STUDENT, /student/);
    const sp = student.page;
    await sp.goto("/student/scenarios");
    const card = sp.getByRole("article", { name: title });
    await expect(card).toBeVisible();
    await card
      .getByRole("link", { name: /Начать/ })
      .or(card.getByRole("button", { name: /Начать/ }))
      .click();
    await expect(sp.getByRole("heading", { name: "Оценка обстановки" })).toBeVisible();
    await expect(sp.getByText("Заявитель сообщает, что дерево упало на дорогу.")).toBeVisible();
    // подсказок нет: маршрут и баллы не показываются, видны кнопки действий и варианты выбора
    await expect(sp.getByText(/штраф/i)).toHaveCount(0);
    await sp.getByLabel("Есть угроза людям").check(); // шаг с выбором: действия доступны после выбора варианта
    await sp.getByRole("button", { name: "Вызвать полицию" }).click(); // неверное действие
    await expect(sp.getByText(/не подходит к текущему шагу/)).toBeVisible();
    await sp.getByRole("button", { name: "Оценить обстановку" }).click();
    await expect(sp.getByText("Зачтено", { exact: false }).first()).toBeVisible();
    await expect(sp.getByText(/95/).first()).toBeVisible(); // 100 − 5 за одно неверное действие
    await expect(sp.getByText("Эвакуация организована")).toBeVisible();
    // результат сохранён: список показывает последний результат
    await sp.goto("/student/scenarios");
    await expect(sp.locator("article, li, section").filter({ hasText: title }).first()).toContainText(
      "Зачтено",
    );
    await student.context.close();
  });

  await test.step("преподаватель видит прохождение; опубликованная версия 2 и результат не изменились", async () => {
    await page.goto(`/teacher/scenarios/${scenarioId}?tab=graph`);
    const runs = graphOf(page).getByRole("table");
    await expect(runs).toContainText("u-005");
    await expect(runs).toContainText("95");
    const v2 = await (await page.request.get(`/api/v1/ai/scenarios/${scenarioId}/versions/2`)).json();
    expect(v2.approval).toBe("approved");
    const list = await (
      await page.request.get("/api/v1/ai/scenario-runs", { params: { scenarioId } })
    ).json();
    expect(list).toHaveLength(1);
    expect(list[0].version).toBe(2);
    expect(list[0].result.score).toBe(95);
    expect(list[0].result.wrongAttempts).toBe(1);
  });

  await author.context.close();
  test.info().annotations.push({ type: "scenarioId", description: scenarioId });
});
