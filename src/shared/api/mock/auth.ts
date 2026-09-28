/*
 * POST /api/mock/auth/login (T1.1-08; 04-pages/00-auth.md). Сверка логин + пароль + номер АРМ (User.armNumber),
 * как в реальном АРМ-112. Источник — store (учитывает блокировку администратором).
 * Любое несовпадение (логин, пароль, номер АРМ) → 401 без уточнения, что неверно; заблокирован → 403
 * (только после верной тройки — чтобы не раскрывать существование учётки).
 * Пароль не логируется и не возвращается.
 */
import type { AuthPolicy, AuthSession, LoginRequest } from "../types";
import { readJsonBody } from "./request";
import { HTTP_STATUS, MockApiError, unauthorized, validationFailed } from "./respond";
import { appendAuditEntry, listStoredUsers, readSystemSettings } from "./store-admin";
import { nowIso } from "./time";

export const LOGIN_ERROR_MESSAGE = "Неверный логин или пароль";
export const ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору";

const ARM_NUMBER = /^\d+$/;
const TOKEN_RADIX = 36;

function readArmNumber(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && ARM_NUMBER.test(value.trim())) return Number(value.trim());
  throw validationFailed("Укажите номер АРМ");
}

function parseLoginRequest(body: Record<string, unknown>): LoginRequest {
  const { login, password } = body;
  if ("twoFactorCode" in body) throw validationFailed("Код 2FA не поддерживается");
  if (typeof login !== "string" || !login.trim()) throw validationFailed("Укажите логин");
  if (typeof password !== "string" || !password) throw validationFailed("Укажите пароль");
  return { login: login.trim(), password, armNumber: readArmNumber(body.armNumber) };
}

/** Мок-токен (не секрет): пользователь + время выдачи. */
function createMockToken(userId: string): string {
  return `mock-${userId}-${Date.now().toString(TOKEN_RADIX)}`;
}

/**
 * Публичная проекция политики парольного входа.
 */
export function getAuthPolicy(): AuthPolicy {
  const { security } = readSystemSettings();
  return {
    twoFactorRequired: false,
    minPasswordLength: security.minPasswordLength,
    lockAfterAttempts: security.lockAfterAttempts,
  };
}

export function authenticate(credentials: LoginRequest): AuthSession {
  const user = listStoredUsers().find(
    (candidate) =>
      candidate.login === credentials.login &&
      candidate.password === credentials.password &&
      candidate.armNumber === credentials.armNumber,
  );
  if (!user) throw unauthorized(LOGIN_ERROR_MESSAGE);
  if (!user.isActive) {
    throw new MockApiError(HTTP_STATUS.forbidden, "accountBlocked", ACCOUNT_BLOCKED_MESSAGE);
  }
  appendAuditEntry({
    userId: user.id,
    role: user.role,
    action: "auth.login",
    details: `Вход в систему, АРМ ${user.armNumber}`,
    operatorArm: user.armNumber,
  });
  return {
    userId: user.id,
    role: user.role,
    token: createMockToken(user.id),
    twoFactorUsed: false,
    issuedAt: nowIso(),
  };
}

export async function login(httpRequest: Request): Promise<AuthSession> {
  return authenticate(parseLoginRequest(await readJsonBody(httpRequest)));
}
