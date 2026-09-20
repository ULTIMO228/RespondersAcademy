/*
 * POST /api/mock/auth/login (T1.1-08; 04-pages/00-auth.md). Сверка логин + пароль + номер АРМ (User.armNumber),
 * как в реальном АРМ-112. Источник — store (учитывает блокировку администратором).
 * Любое несовпадение (логин, пароль, номер АРМ) → 401 без уточнения, что неверно; заблокирован → 403
 * (только после верной тройки — чтобы не раскрывать существование учётки). 2FA-заглушка: любой 6-значный код.
 * Пароль не логируется и не возвращается.
 */
import type { AuthPolicy, AuthSession, LoginRequest } from "../types";
import { readJsonBody } from "./request";
import { HTTP_STATUS, MockApiError, unauthorized, validationFailed } from "./respond";
import { appendAuditEntry, listStoredUsers, readSystemSettings } from "./store-admin";
import { nowIso } from "./time";

export const LOGIN_ERROR_MESSAGE = "Неверный логин или пароль";
export const ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору";

const TWO_FACTOR_CODE = /^\d{6}$/;
const ARM_NUMBER = /^\d+$/;
const TOKEN_RADIX = 36;

function readArmNumber(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && ARM_NUMBER.test(value.trim())) return Number(value.trim());
  throw validationFailed("Укажите номер АРМ");
}

function parseLoginRequest(body: Record<string, unknown>): LoginRequest {
  const { login, password, twoFactorCode } = body;
  if (typeof login !== "string" || !login.trim()) throw validationFailed("Укажите логин");
  if (typeof password !== "string" || !password) throw validationFailed("Укажите пароль");
  const request: LoginRequest = { login: login.trim(), password, armNumber: readArmNumber(body.armNumber) };
  if (twoFactorCode === undefined || twoFactorCode === null) return request;
  if (typeof twoFactorCode !== "string" || !TWO_FACTOR_CODE.test(twoFactorCode)) {
    throw validationFailed("Код из сообщения должен состоять из 6 цифр");
  }
  return { ...request, twoFactorCode };
}

/** Мок-токен (не секрет): пользователь + время выдачи. */
function createMockToken(userId: string): string {
  return `mock-${userId}-${Date.now().toString(TOKEN_RADIX)}`;
}

/**
 * Политика входа для формы `/login` (T4.2-17): публичная проекция `SystemSettings.security`.
 * Администратор выключает «Требовать 2FA» на `/admin/system` — шаг кода пропадает.
 */
export function getAuthPolicy(): AuthPolicy {
  const { security } = readSystemSettings();
  return {
    twoFactorRequired: security.require2fa,
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
  /*
   * Вход завершён: при включённой 2FA — только после шага кода (первый запрос лишь проверяет тройку),
   * при выключенной — сразу. Только завершённый вход пишется в журнал аудита (21-admin-system.md §4).
   */
  const twoFactorUsed = credentials.twoFactorCode !== undefined;
  if (twoFactorUsed || !getAuthPolicy().twoFactorRequired) {
    appendAuditEntry({
      userId: user.id,
      role: user.role,
      action: "auth.login",
      details: `Вход в систему, АРМ ${user.armNumber}${twoFactorUsed ? ", подтверждён кодом" : ""}`,
      operatorArm: user.armNumber,
    });
  }
  return {
    userId: user.id,
    role: user.role,
    token: createMockToken(user.id),
    twoFactorUsed,
    issuedAt: nowIso(),
  };
}

export async function login(httpRequest: Request): Promise<AuthSession> {
  return authenticate(parseLoginRequest(await readJsonBody(httpRequest)));
}
