/*
 * Сквозная проверка платформы (спека 002, T058, SC-009…SC-011): вход → главная → задания → симулятор → результаты →
 * аналитика → справочник → профиль → выход, по трём ролям — оболочка и навигация, граница с симулятором.
 * На моке (штатный Playwright) страницы, которым нужны данные бэкенда, честно показывают «Раздел требует подключения
 * к серверу тренажёра»; на стенде с бэкендом (`E2E_BACKEND=1`, backend/scripts/run_frontend_e2e.sh --only platform) —
 * данные или пустые состояния. Оба исхода проверяются явно: страница не падает и ничего не прячет.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { loginAs } from "./helpers/auth";

const IS_BACKEND = process.env.E2E_BACKEND === "1";
const SERVER_REQUIRED = "Раздел требует подключения к серверу тренажёра";
const DISCLAIMER = "Учебная система. Не является рабочей системой-112";

/** Боковая панель кабинета. */
const sidebar = (page: Page) => page.getByRole("complementary", { name: "Разделы кабинета" });

/** Страница данных: либо содержимое, либо «нужен сервер» (мок) — но не ошибка и не пустой экран. */
async function expectLoadedOrServerRequired(page: Page) {
  await expect(page.getByText("Не удалось загрузить")).toHaveCount(0);
  if (!IS_BACKEND) await expect(page.getByText(SERVER_REQUIRED).first()).toBeVisible();
}

test.describe("платформа: путь обучающегося", () => {
  test("вход → главная → задания → симулятор → результаты → аналитика → справочник → профиль → выход", async ({
    page,
  }) => {
    await loginAs(page, "student");

    /* Главная и оболочка. */
    await expect(page).toHaveURL(/\/student$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Здравствуйте");
    await expect(page.getByText(DISCLAIMER)).toBeVisible();
    for (const name of [
      "Главная",
      "Задания",
      "Результаты",
      "Аналитика",
      "Справочник",
      "Открыть АРМ",
      "Профиль",
    ]) {
      await expect(sidebar(page).getByRole("link", { name })).toBeVisible();
    }

    /* Задания. */
    await sidebar(page).getByRole("link", { name: "Задания" }).click();
    await page.waitForURL(/\/student\/assignments$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Задания и экзамены");
    await expectLoadedOrServerRequired(page);

    /* Симулятор: реплика АРМ с панелью «В кабинет», без оболочки платформы. */
    await sidebar(page).getByRole("link", { name: "Открыть АРМ" }).click();
    await page.waitForURL(/\/arm$/);
    await expect(page.getByRole("heading", { name: "Поиск происшествий" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Разделы кабинета" })).toHaveCount(0);
    await page.getByRole("link", { name: /В кабинет/ }).click();
    await page.waitForURL(/\/student$/);

    /* Результаты и аналитика. */
    await sidebar(page).getByRole("link", { name: "Результаты" }).click();
    await page.waitForURL(/\/student\/results$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Результаты");
    await expectLoadedOrServerRequired(page);
    await sidebar(page).getByRole("link", { name: "Аналитика" }).click();
    await page.waitForURL(/\/student\/analytics$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Аналитика");
    await expectLoadedOrServerRequired(page);

    /* Справочник: горячие клавиши и служебные номера работают без бэкенда. */
    await sidebar(page).getByRole("link", { name: "Справочник" }).click();
    await page.waitForURL(/\/reference$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справочник");
    await page.getByRole("tab", { name: /Горячие клавиши/ }).click();
    await expect(page.getByRole("table")).toHaveCount(5);
    await page.getByRole("tab", { name: /Служебные номера/ }).click();
    await expect(page.getByRole("table", { name: "Служебные номера" })).toBeVisible();

    /* Профиль. */
    await sidebar(page).getByRole("link", { name: "Профиль" }).click();
    await page.waitForURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Профиль");
    await expect(page.getByText("ivanov").or(page.getByText("tarasova"))).toBeVisible();

    /* Выход: возврат на вход, защищённый раздел больше не открывается. */
    await page.getByRole("link", { name: "Выйти" }).click();
    await page.waitForURL(/\/login/);
    await page.goto("/student");
    await page.waitForURL(/\/login/);
  });

  test("прежние адреса симулятора «прогресс» и «справка» ведут в платформу", async ({ page }) => {
    await loginAs(page, "student");
    await page.goto("/arm/progress");
    await page.waitForURL(/\/student\/analytics$/);
    await page.goto("/arm/help");
    await page.waitForURL(/\/reference$/);
  });

  test("поиск справочника: пустой результат и работающий фильтр", async ({ page }) => {
    await loginAs(page, "student");
    await page.goto("/reference");
    await page.getByRole("tab", { name: /Служебные номера/ }).click();
    const search = page.getByLabel("Поиск по всем разделам");
    await search.fill("101");
    await expect(page.getByRole("table", { name: "Служебные номера" }).getByRole("row")).not.toHaveCount(0);
    await search.fill("такого-нет-нигде");
    await expect(page.getByText("Номера не найдены")).toBeVisible();
  });
});

test.describe("платформа: оболочка других ролей", () => {
  test("преподаватель: кабинет в оболочке платформы, справочник и профиль доступны", async ({ page }) => {
    await loginAs(page, "teacher");
    await expect(page.getByText(DISCLAIMER)).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Справочник" })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Задания" })).toHaveCount(0);
    await page.goto("/reference");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справочник");
    await page.goto("/account/security");
    await expect(page.getByRole("form", { name: "Смена пароля" })).toBeVisible();
    expect((await page.goto("/student"))?.status()).toBe(403);
  });

  test("администратор: кабинет в оболочке платформы, справочник и профиль доступны", async ({ page }) => {
    await loginAs(page, "admin");
    await expect(page.getByText(DISCLAIMER)).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Пользователи" })).toBeVisible();
    await page.goto("/reference");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Справочник");
    await page.goto("/account");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Профиль");
    expect((await page.goto("/teacher"))?.status()).toBe(403);
  });

  test("экраны платформы не обращаются к внешним хостам", async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (!url.startsWith(baseURL ?? "") && !/^(data|blob|about):/.test(url)) external.push(url);
    });
    await loginAs(page, "student");
    for (const path of [
      "/student",
      "/student/assignments",
      "/student/results",
      "/student/analytics",
      "/reference",
      "/account",
      "/account/security",
    ]) {
      expect((await page.goto(path))?.status(), path).toBe(200);
      await page.waitForLoadState("networkidle");
    }
    expect(external, `внешние запросы: ${external.join(", ")}`).toEqual([]);
  });
});
