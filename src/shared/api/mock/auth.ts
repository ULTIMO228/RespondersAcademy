/*
 * Авторизация мок-слоя (паритет с бэкендом: backend/app/api/compat/auth.py).
 *   POST /auth/login       — логин + пароль (номер АРМ необязателен: если передан — сверяется). Любое несовпадение
 *                            → 401 без уточнения, что неверно; заблокирован → 403 (только после верных данных).
 *                            Сессию выдаёт сервер: HttpOnly-cookie с подписанным JWT (auth-tokens.ts).
 *   GET  /auth/session     — профиль по cookie (основа verifySession на сервере Next).
 *   POST /auth/logout      — идемпотентный выход: сессия отзывается, cookie очищается.
 *   POST /auth/password    — смена пароля самим пользователем: остальные сессии отзываются, текущая жива.
 *   POST /auth/logout-all  — отзыв всех сессий пользователя.
 * Пароль не логируется и не возвращается; токен в теле входа — заглушка формы AuthSession, не credential.
 */
import type { AuthPolicy, AuthSession, PublicUser, Role } from "../types";
import { issueSessionToken, readRequestSession, sessionClearCookie, sessionSetCookie } from "./auth-tokens";
import type { VerifiedSession } from "./auth-tokens";
import { readJsonBody } from "./request";
import { HTTP_STATUS, MockApiError, unauthorized, validationFailed } from "./respond";
import { appendAuditEntry, findStoredUser, listStoredUsers, readSystemSettings } from "./store-admin";
import { toPublicUser, updateStoredUser } from "./store-admin";
import { revokeAuthSession, revokeUserAuthSessions } from "./store-auth";
import { nowIso } from "./time";

export const LOGIN_ERROR_MESSAGE = "Неверный логин или пароль";
export const ACCOUNT_BLOCKED_MESSAGE = "Учётная запись заблокирована. Обратитесь к администратору";

export const WRONG_CURRENT_PASSWORD_MESSAGE = "Текущий пароль указан неверно";
export const SESSION_REQUIRED_MESSAGE = "Войдите в систему, чтобы просмотреть результаты";

const ARM_NUMBER = /^\d+$/;
const TOKEN_RADIX = 36;

/** Номер АРМ необязателен (платформа входит по логину и паролю); если передан — должен быть числом. */
function readArmNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || (typeof value === "string" && !value.trim())) return undefined;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && ARM_NUMBER.test(value.trim())) return Number(value.trim());
  throw validationFailed("Номер АРМ должен быть числом");
}

interface Credentials {
  login: string;
  password: string;
  armNumber?: number;
}

function parseCredentials(body: Record<string, unknown>): Credentials {
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

export interface LoginResult {
  /** Тело ответа (форма AuthSession); `token` — заглушка, cookie с настоящим токеном ставится заголовком. */
  session: AuthSession;
  setCookie: string;
}

export function authenticate(credentials: Credentials, httpRequest: Request): LoginResult {
  const user = listStoredUsers().find(
    (candidate) =>
      candidate.login === credentials.login &&
      candidate.password === credentials.password &&
      (credentials.armNumber === undefined || candidate.armNumber === credentials.armNumber),
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
  const nowMs = Date.now();
  const token = issueSessionToken(user.id, user.role, nowMs);
  return {
    session: {
      userId: user.id,
      role: user.role,
      token: createMockToken(user.id),
      twoFactorUsed: false,
      issuedAt: nowIso(),
    },
    setCookie: sessionSetCookie(token, httpRequest),
  };
}

export async function login(httpRequest: Request): Promise<LoginResult> {
  return authenticate(parseCredentials(await readJsonBody(httpRequest)), httpRequest);
}

function requireSession(httpRequest: Request): VerifiedSession {
  const session = readRequestSession(httpRequest, Date.now());
  if (!session) throw unauthorized(SESSION_REQUIRED_MESSAGE);
  return session;
}

/** GET /auth/session → PublicUser сессии (401 без действующей сессии). */
export function getSessionProfile(httpRequest: Request): PublicUser {
  const user = findStoredUser(requireSession(httpRequest).userId);
  if (!user) throw unauthorized(SESSION_REQUIRED_MESSAGE);
  return toPublicUser(user);
}

function auditAuth(userId: string, role: Role, action: string, details: (armNumber: number) => string): void {
  const armNumber = findStoredUser(userId)?.armNumber ?? 0;
  appendAuditEntry({ userId, role, action, details: details(armNumber), operatorArm: armNumber });
}

/** POST /auth/logout: сессия (если жива) отзывается; cookie очищается в любом случае. */
export function logout(httpRequest: Request): { clearCookie: string } {
  const session = readRequestSession(httpRequest, Date.now());
  if (session) {
    revokeAuthSession(session.jti, Date.now());
    auditAuth(session.userId, session.role, "auth.logout", (arm) => `Выход из системы, АРМ ${arm}`);
  }
  return { clearCookie: sessionClearCookie(httpRequest) };
}

/** POST /auth/logout-all: отзыв всех сессий пользователя, включая текущую. */
export function logoutAll(httpRequest: Request): { clearCookie: string } {
  const session = requireSession(httpRequest);
  revokeUserAuthSessions(session.userId, Date.now());
  auditAuth(session.userId, session.role, "auth.logoutAll", (arm) => `Выход на всех устройствах, АРМ ${arm}`);
  return { clearCookie: sessionClearCookie(httpRequest) };
}

/** POST /auth/password: текущий пароль, политика длины, отзыв остальных сессий. Неверный текущий — 400, не 401. */
export async function changePassword(httpRequest: Request): Promise<void> {
  const session = requireSession(httpRequest);
  const body = await readJsonBody(httpRequest);
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || !currentPassword)
    throw validationFailed("Укажите текущий пароль");
  if (typeof newPassword !== "string" || !newPassword) throw validationFailed("Укажите новый пароль");
  const user = findStoredUser(session.userId);
  if (!user) throw unauthorized(SESSION_REQUIRED_MESSAGE);
  if (user.password !== currentPassword) throw validationFailed(WRONG_CURRENT_PASSWORD_MESSAGE);
  const { minPasswordLength } = readSystemSettings().security;
  if (newPassword.length < minPasswordLength) {
    throw validationFailed(`Пароль должен содержать не менее ${minPasswordLength} символов`);
  }
  if (newPassword === user.password) throw validationFailed("Новый пароль должен отличаться от текущего");
  updateStoredUser(user.id, (draft) => {
    draft.password = newPassword;
  });
  revokeUserAuthSessions(user.id, Date.now(), session.jti);
  auditAuth(
    user.id,
    user.role,
    "auth.passwordChange",
    (arm) => `Смена пароля пользователем, АРМ ${arm}; остальные сессии завершены`,
  );
}
