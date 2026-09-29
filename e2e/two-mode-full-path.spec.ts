/*
 * Сквозной путь двух режимов (спека 002, T026, SC-006): обучающийся проходит этап 112 задания-цепочки → преподаватель подтверждает
 * вход ДДС → этап ДДС: карточка, принятая обучающимся, и сообщения служб. Голосовой доклад в прогоне не участвует (нужна модель
 * Vosk и микрофон; поведение доклада покрыто тестами `features/report-recorder`).
 *
 * Требует стенда с БЭКЕНДОМ и фикстурой цепочки: `backend/scripts/run_frontend_e2e.sh --only chain` (сам поднимает бэкенд на чистой БД,
 * применяет `backend/scripts/seed_chain_demo.py`, собирает фронт с BACKEND_URL и запускает этот файл). Против фронта без бэкенда
 * тест пропускается.
 */
import { expect, test } from "@playwright/test";

import { DEMO_ACCOUNTS, loginAs } from "./helpers/auth";
import { setStatus } from "./helpers/steps";

const CHAIN_TITLE = "Цепочка 112 → ДДС (демо)";
/** Обучающийся, которому фикстура T031 назначает цепочку (сид бэкенда: ivanov, АРМ 1). */
const CHAIN_STUDENT = { ...DEMO_ACCOUNTS.student, login: "ivanov", password: "student112" };
const NOT_READY =
  "Требуется стенд с бэкендом и фикстурой цепочки (backend/scripts/run_frontend_e2e.sh --only chain)";

test.describe.configure({ mode: "serial" });

test("цепочка A → B: этап 112 → подтверждение преподавателем → этап ДДС с сообщениями служб", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  /* Рабочее место — desktop-first 1920+ (форма смены статуса на узком экране уходит за край). */
  await page.setViewportSize({ width: 1920, height: 1080 });
  await loginAs(page, "student", CHAIN_STUDENT);
  await page.goto("/student/assignments");
  const card = page.getByRole("article", { name: CHAIN_TITLE });
  const ready = await card.waitFor({ timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  test.skip(!ready, NOT_READY);

  /* Этап A: рабочее место 112. */
  await card.getByRole("button", { name: "Начать" }).click();
  await page.waitForURL(/\/arm\/operator112\?assignmentId=/);
  await page.getByRole("button", { name: "Ответить на вызов" }).click();
  await expect(page.getByLabel("Описание")).toBeEnabled();
  await page.getByLabel("ФИО").fill("Учебный заявитель");
  await page.getByLabel("Статус заявителя").fill("очевидец");
  await page.getByLabel("Описание").fill("Сильный ветер повалил дерево на проезжую часть, пострадавших нет");
  /* Вход ДДС принимает только адрес из локального справочника адресов: вводим его точно, как в карточке сценария. */
  expect(
    process.env.E2E_CHAIN_ADDRESS,
    "нужен E2E_CHAIN_ADDRESS (его выставляет run_frontend_e2e.sh --only chain)",
  ).toBeTruthy();
  await page.getByLabel("Описательный адрес").fill(process.env.E2E_CHAIN_ADDRESS ?? "");
  await page.getByLabel("Происшествие").selectOption("Дерево");
  const chips = page.locator('section[aria-label="Опросная карта"] button[aria-pressed="false"]');
  for (let step = 0; step < 4; step += 1) {
    if (await page.getByText("не определён").isHidden()) break;
    await chips.first().click();
    await page.waitForTimeout(700);
  }
  await expect(page.getByText("не определён")).toBeHidden();
  await page.getByRole("button", { name: "Передать карточку" }).click();
  await expect(page.getByLabel("Разбор попытки")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Этап ДДС ожидает проверки и подтверждения преподавателем/)).toBeVisible();

  /* До подтверждения этап ДДС не открывается: причина сервера показана дословно. */
  await page.getByRole("button", { name: "Начать этап ДДС" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "подтверждения преподавателя" })).toBeVisible();

  /* Преподаватель подтверждает вход ДДС (допущение A8: через API тем же эндпоинтом, что кнопка «Утвердить версию»). */
  const teacherContext = await browser.newContext({ baseURL: page.url().split("/arm")[0] });
  const teacherPage = await teacherContext.newPage();
  await loginAs(teacherPage, "teacher");
  const assignments = await (await teacherContext.request.get("/api/v1/assignments")).json();
  const chain = assignments.find((item: { title: string }) => item.title === CHAIN_TITLE);
  const detail = await (await teacherContext.request.get(`/api/v1/assignments/${chain.id}`)).json();
  const review = detail.progress.find((item: { chainReview?: unknown }) => item.chainReview)?.chainReview as {
    scenarioId: string;
    version: number;
  };
  expect(review).toBeTruthy();
  const approved = await teacherContext.request.post(`/api/v1/ai/scenarios/${review.scenarioId}/approve`, {
    data: { version: review.version, requestId: `e2e-approve-${Date.now()}` },
  });
  expect(approved.status(), await approved.text()).toBe(200);
  await teacherContext.close();

  /* Этап B: карточка обучающегося открывается, после «Принята» приходят сообщения служб. */
  await page.getByRole("button", { name: "Начать этап ДДС" }).click();
  await page.waitForURL(/\/arm\/card\//, { timeout: 30_000 });
  await expect(page.getByLabel("Действие диспетчера")).toBeVisible({ timeout: 30_000 });
  await setStatus(page, "Принята", { dutyNumber: "32" });
  await expect(page.getByText(/Расчёт выехал к месту вызова/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Начать запись" })).toBeVisible();
  await expect(page.getByText(/Работы завершены/)).toBeVisible({ timeout: 60_000 });
});
