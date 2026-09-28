/*
 * Auth-сессия пользователя (spec/000-фронт/05-data-models.md §1 AuthSession; spec/000-фронт/04-pages/00-auth.md).
 * Хранится в cookie SESSION_COOKIE — одно значение видят proxy, серверные лэйауты и клиентский стор.
 */
import type { AuthSession, Role } from "@/shared/api";

export const SESSION_COOKIE = "arm112_session";

const HOURS_PER_SESSION = 24;
const MS_PER_SECOND = 1000;
const SECONDS_PER_HOUR = 3600;

/** Автовыход через 24 часа непрерывной сессии (как в реальном АРМ-112, источник п. 1.1). */
export const SESSION_TTL_MS = HOURS_PER_SESSION * SECONDS_PER_HOUR * MS_PER_SECOND;

const ROLES: readonly Role[] = ["student", "teacher", "admin"];

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function isAuthSession(value: unknown): value is AuthSession {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.userId === "string" &&
    isRole(candidate.role) &&
    typeof candidate.token === "string" &&
    typeof candidate.twoFactorUsed === "boolean" &&
    typeof candidate.issuedAt === "string" &&
    !Number.isNaN(Date.parse(candidate.issuedAt))
  );
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function tryDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Значение cookie сессии: только поля AuthSession (без лишних данных пользователя). */
export function serializeSession(session: AuthSession): string {
  const { userId, role, token, twoFactorUsed, issuedAt } = session;
  return JSON.stringify({ userId, role, token, twoFactorUsed, issuedAt });
}

/** Разбор значения cookie (закодированного или уже раскодированного); мусор → null. */
export function parseSession(raw: string | null | undefined): AuthSession | null {
  if (!raw) return null;
  const parsed = tryParseJson(raw) ?? tryParseJson(tryDecode(raw));
  return isAuthSession(parsed) ? parsed : null;
}

export function getSessionExpiresAt(session: AuthSession): number {
  return Date.parse(session.issuedAt) + SESSION_TTL_MS;
}

export function isSessionExpired(session: AuthSession, nowMs: number): boolean {
  return nowMs >= getSessionExpiresAt(session);
}

/** Остаток жизни сессии в секундах (для Max-Age cookie), не меньше 0. */
export function getSessionMaxAgeSeconds(session: AuthSession, nowMs: number): number {
  return Math.max(0, Math.ceil((getSessionExpiresAt(session) - nowMs) / MS_PER_SECOND));
}
