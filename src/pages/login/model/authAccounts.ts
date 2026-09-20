/*
 * Демо-подсказки экрана входа (T2.1-09) — только сервер и только в демо-режиме.
 * Проверка кредов — на сервере мок-слоя (POST /api/mock/auth/login), клиент список учёток не получает.
 */
import type { AuthCredentials } from "@/features/auth-form";
import { users } from "@/shared/api";
import type { UserRole } from "@/shared/api";
import { DEMO_USER_IDS } from "@/shared/config";

import { BLOCKED_DEMO_LOGIN } from "../config/loginContent";

/** Тестовая учётка для подсказки (проекция User из mocks/users.json). */
export type DemoAccount = {
  login: string;
  password: string;
  role: UserRole;
  armNumber: number;
  isActive: boolean;
};

const ROLES: UserRole[] = ["student", "teacher", "admin"];

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === "string" && ROLES.includes(role as UserRole);
}

function toDemoAccount(login: string): DemoAccount[] {
  const user = users.find((candidate) => candidate.login === login);
  if (!user || !isUserRole(user.role)) return [];
  const { password, role, armNumber, isActive } = user;
  return [{ login, password, role, armNumber, isActive }];
}

/** Подсказки демо-режима: по учётке на роль + заблокированная (демо отказа входа). */
export function pickDemoAccounts(): DemoAccount[] {
  const demoLogins = users
    .filter((user) => Object.values<string>(DEMO_USER_IDS).includes(user.id))
    .map((user) => user.login)
    .concat(BLOCKED_DEMO_LOGIN);
  return demoLogins.flatMap(toDemoAccount);
}

/** Предзаполнение формы демо-учёткой роли (как автозаполнение браузера на ДДС_image1). */
export function pickDemoCredentials(role: UserRole): AuthCredentials | undefined {
  const login = users.find((user) => user.id === DEMO_USER_IDS[role])?.login;
  const [account] = login ? toDemoAccount(login) : [];
  if (!account) return undefined;
  return { login: account.login, password: account.password, armNumber: String(account.armNumber) };
}
