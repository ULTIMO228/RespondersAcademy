/*
 * Smoke-проверки: инфраструктура e2e (T5.1-01, T5.1-02) — `/login` отвечает 200 и показывает форму входа,
 * хелпер loginAs проводит все три роли в их разделы; офлайн-контур (T5.1-12) — 11 экранов открываются
 * и не делают ни одного запроса за пределы baseURL.
 */
import { expect, test } from "@playwright/test";

import { DEMO_ACCOUNTS, loginAs } from "./helpers/auth";
import type { DemoRole } from "./helpers/auth";
import { DEMO_CARD, DEMO_SCENARIO, DEMO_STUDENT } from "./helpers/demo-data";

test("страница входа отдаёт 200 и показывает форму «112 ВХОД В СИСТЕМУ»", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1 })).toContainText("ВХОД В СИСТЕМУ");
  const form = page.getByRole("form", { name: "Вход в систему" });
  await expect(form.getByLabel("логин:")).toBeVisible();
  await expect(form.getByLabel("пароль:")).toBeVisible();
  await expect(form.getByLabel("номер АРМ:")).toBeVisible();
  await expect(form.getByRole("button", { name: "ВОЙТИ" })).toBeEnabled();
  await expect(page.getByText("Учебная система. Не является рабочей системой-112")).toBeVisible();
});

/** Маркер раздела каждой роли — заголовок первого экрана после входа. */
const ROLE_LANDINGS: Record<DemoRole, string> = {
  teacher: "Преподаватель",
  student: "Поиск происшествий",
  admin: "Администратор",
};

for (const role of Object.keys(ROLE_LANDINGS) as DemoRole[]) {
  test(`loginAs('${role}') попадает в раздел роли`, async ({ page }) => {
    await loginAs(page, role);
    expect(page.url()).toMatch(DEMO_ACCOUNTS[role].landing);
    await expect(page.getByText(ROLE_LANDINGS[role]).first()).toBeVisible();
  });
}

/**
 * Локальный контур (T5.1-12; spec/03-architecture.md, Q&A в11): ни один из 11 экранов не обращается к
 * внешним хостам — ни за шрифтами и CDN, ни за данными. Сетевой перехват Playwright пишет каждый запрос
 * страницы; допустимы только baseURL и схемы без сети (data:, blob:, about:).
 */
const LOCAL_SCHEMES = ["data:", "blob:", "about:", "chrome-error:"];

const SCREENS: Record<DemoRole, string[]> = {
  teacher: [
    "/teacher",
    `/teacher/monitor/${DEMO_STUDENT.id}`,
    "/teacher/scenarios",
    `/teacher/scenarios/${DEMO_SCENARIO.id}`,
    "/teacher/session",
    "/teacher/reports",
  ],
  student: ["/arm", `/arm/card/${DEMO_CARD.id}`, "/arm/phone", "/arm/progress", "/arm/help"],
  admin: ["/admin/users", "/admin/system"],
};

for (const role of Object.keys(SCREENS) as DemoRole[]) {
  test(`экраны роли «${role}» не обращаются к внешним хостам`, async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      const isLocal = url.startsWith(baseURL ?? "") || LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme));
      if (!isLocal) external.push(url);
    });

    await loginAs(page, role);
    for (const screen of SCREENS[role]) {
      const response = await page.goto(screen);
      expect(response?.status(), `${screen} отвечает 200`).toBe(200);
      await expect(page.locator("body")).toBeVisible();
    }
    expect(external, `внешние запросы: ${external.join(", ")}`).toEqual([]);
  });
}
