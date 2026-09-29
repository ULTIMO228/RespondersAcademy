/*
 * Сессия пользователя глазами клиентского слоя. Cookie SESSION_COOKIE выдаёт и очищает только сервер (HttpOnly, значение —
 * подписанный JWT); клиентский код её не читает и не пишет. Здесь — только оптимистичное чтение заявленных полей JWT
 * для proxy (наличие, срок, роль) БЕЗ проверки подписи: секрет остаётся у бэкенда, а данные защищает verifySession()
 * (server-session.ts), которая спрашивает сервер (GET /auth/session).
 */
import type { Role } from "@/shared/api";

export { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/shared/config";

/** Заголовок запроса, который proxy проставляет для серверных лэйаутов: куда вернуть пользователя после входа. */
export const RETURN_URL_HEADER = "x-arm-return-url";

const ROLES: readonly Role[] = ["student", "teacher", "admin"];
const MS_PER_SECOND = 1000;
const JWT_PARTS = 3;

/** Заявленные (непроверенные подписью) поля токена сессии. */
export interface SessionClaims {
  userId: string;
  role: Role;
  /** Конец жизни токена, мс с эпохи. */
  expiresAtMs: number;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function decodeBase64Url(segment: string): string | null {
  try {
    const padded = segment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Поля JWT из значения cookie; не JWT, битая структура или нет `sub`/`role`/`exp` → null. Подпись НЕ проверяется. */
export function readSessionClaims(raw: string | null | undefined): SessionClaims | null {
  if (!raw) return null;
  const parts = raw.split(".");
  if (parts.length !== JWT_PARTS) return null;
  const json = decodeBase64Url(parts[1]);
  if (json === null) return null;
  try {
    const payload = JSON.parse(json) as Record<string, unknown>;
    const { sub, role, exp } = payload;
    if (typeof sub !== "string" || !isRole(role) || typeof exp !== "number") return null;
    return { userId: sub, role, expiresAtMs: exp * MS_PER_SECOND };
  } catch {
    return null;
  }
}

export function isSessionExpired(claims: SessionClaims, nowMs: number): boolean {
  return nowMs >= claims.expiresAtMs;
}
