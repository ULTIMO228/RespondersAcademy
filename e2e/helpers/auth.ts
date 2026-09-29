/*
 * Вход в платформу для e2e (спека 002, T040): форма «Логин · Пароль» → «Войти» → главная страница роли.
 * Номера АРМ и шага 2FA нет (A14). Локаторы — по подписям полей и доступным именам, без CSS-классов.
 */
import type { Page } from "@playwright/test";

import { DEMO_STUDENT } from "./demo-data";

export type DemoRole = "teacher" | "student" | "admin";

export type DemoAccount = {
  login: string;
  password: string;
  /** Раздел, куда попадает роль после входа (shared/config → ROUTES). */
  landing: RegExp;
};

/** Демо-учётки прототипа (mocks/users.json, подсказки блока «Тестовые учётные записи»). */
export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> = {
  teacher: { login: "morozova", password: "teacher112", landing: /\/teacher(\/|$)/ },
  student: {
    login: DEMO_STUDENT.login,
    password: DEMO_STUDENT.password,
    landing: /\/student(\/|$)/,
  },
  admin: { login: "admin", password: "admin112", landing: /\/admin(\/|$)/ },
};

/** Вход ролью: заполняет форму и ждёт главную страницу роли. */
export async function loginAs(page: Page, role: DemoRole, account = DEMO_ACCOUNTS[role]): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(account.login);
  await page.getByLabel("Пароль").fill(account.password);
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForURL(account.landing, { timeout: 20_000 });
}
