/*
 * Вход в тренажёр для e2e (spec/000-фронт/04-pages/00-auth.md «Состав» и «Поведение»).
 *
 * Форма: логин · пароль · номер АРМ → «ВОЙТИ» → шаг 2FA-заглушки «код из сообщения» (любые 6 цифр,
 * включается настройкой администратора — если шаг выключен, хелпер его пропускает).
 * Локаторы — по подписям полей и доступным именам, без CSS-классов.
 */
import type { Page } from "@playwright/test";

import { DEMO_STUDENT } from "./demo-data";

export type DemoRole = "teacher" | "student" | "admin";

export type DemoAccount = {
  login: string;
  password: string;
  armNumber: string;
  /** Раздел, куда попадает роль после входа (shared/config → ROUTES). */
  landing: RegExp;
};

/** Демо-учётки прототипа (mocks/users.json, подсказки блока «Тестовые учётные записи»). */
export const DEMO_ACCOUNTS: Record<DemoRole, DemoAccount> = {
  teacher: { login: "morozova", password: "teacher112", armNumber: "21", landing: /\/teacher(\/|$)/ },
  student: {
    login: DEMO_STUDENT.login,
    password: DEMO_STUDENT.password,
    armNumber: DEMO_STUDENT.armNumber,
    landing: /\/arm(\/|$)/,
  },
  admin: { login: "admin", password: "admin112", armNumber: "24", landing: /\/admin(\/|$)/ },
};

/** Любой шестизначный код проходит 2FA-заглушку (spec/000-фронт/04-pages/00-auth.md «Поведение»). */
export const TWO_FACTOR_CODE = "123456";

/** Вход ролью: заполняет форму, проходит шаг кода (если включён) и ждёт раздел роли. */
export async function loginAs(page: Page, role: DemoRole, account = DEMO_ACCOUNTS[role]): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("логин:").fill(account.login);
  await page.getByLabel("пароль:").fill(account.password);
  await page.getByLabel("номер АРМ:").fill(account.armNumber);
  await page.getByRole("button", { name: "ВОЙТИ" }).click();

  const codeField = page.getByLabel("код из сообщения:");
  const landed = page.waitForURL(account.landing, { timeout: 20_000 });
  await Promise.race([codeField.waitFor({ timeout: 20_000 }), landed]);
  if (await codeField.isVisible().catch(() => false)) {
    await codeField.fill(TWO_FACTOR_CODE);
    await page.getByRole("button", { name: "ВОЙТИ" }).click();
  }
  await page.waitForURL(account.landing, { timeout: 20_000 });
}
