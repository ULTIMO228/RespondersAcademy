/*
 * Токен сессии мок-слоя — JWT HS256, по форме тот же, что выдаёт бэкенд (sub, role, jti, iss, aud, iat, exp), чтобы
 * `proxy` читал оба одинаково. Подпись проверяет только мок-слой (секрет — серверная переменная процесса, store-auth.ts);
 * `proxy` подпись не проверяет. Cookie ставит сервер: HttpOnly, SameSite=Lax, Path=/, Secure при HTTPS.
 */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "@/shared/config";

import type { Role } from "../types";
import { findAuthSession, getSessionSecret, registerAuthSession } from "./store-auth";
import { findStoredUser } from "./store-admin";

const MS_PER_SECOND = 1000;
const JTI_BYTES = 32;
const TOKEN_ISSUER = "responders-academy";
const TOKEN_AUDIENCE = "responders-academy-mock";
const HEADER = { alg: "HS256", typ: "JWT" } as const;
const TOKEN_PARTS = 3;

export interface VerifiedSession {
  userId: string;
  role: Role;
  jti: string;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signature(signingInput: string): Buffer {
  return createHmac("sha256", getSessionSecret()).update(signingInput).digest();
}

function isRole(value: unknown): value is Role {
  return value === "student" || value === "teacher" || value === "admin";
}

/** Новая сессия: запись в реестре (jti) + подписанный токен. */
export function issueSessionToken(userId: string, role: Role, nowMs: number): string {
  const jti = randomBytes(JTI_BYTES).toString("base64url");
  const iat = Math.floor(nowMs / MS_PER_SECOND);
  const exp = iat + SESSION_TTL_SECONDS;
  registerAuthSession(jti, { userId, expiresAtMs: exp * MS_PER_SECOND, revokedAtMs: null });
  const signingInput = `${encode(HEADER)}.${encode({ sub: userId, role, jti, iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE, iat, exp })}`;
  return `${signingInput}.${signature(signingInput).toString("base64url")}`;
}

function hasValidSignature(signingInput: string, provided: string): boolean {
  const expected = signature(signingInput);
  const actual = Buffer.from(provided, "base64url");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parsePayload(encoded: string): Record<string, unknown> | null {
  try {
    const payload: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Проверка токена целиком: подпись, издатель/адресат, срок, отзыв сессии (jti), активность пользователя и
 * совпадение роли с текущей ролью в сторе (блокировка посреди сессии сразу даёт null → 401).
 */
export function verifySessionToken(token: string | undefined, nowMs: number): VerifiedSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS) return null;
  const [header, body, provided] = parts;
  if (!hasValidSignature(`${header}.${body}`, provided)) return null;
  const headerClaims = parsePayload(header);
  const claims = parsePayload(body);
  if (headerClaims?.alg !== HEADER.alg || !claims) return null;
  const { sub, role, jti, iss, aud, exp } = claims;
  if (iss !== TOKEN_ISSUER || aud !== TOKEN_AUDIENCE) return null;
  if (typeof sub !== "string" || !isRole(role) || typeof jti !== "string" || typeof exp !== "number")
    return null;
  if (exp * MS_PER_SECOND <= nowMs) return null;
  const stored = findAuthSession(jti);
  if (!stored || stored.revokedAtMs !== null || stored.userId !== sub || stored.expiresAtMs <= nowMs)
    return null;
  const user = findStoredUser(sub);
  if (!user || !user.isActive || user.role !== role) return null;
  return { userId: sub, role, jti };
}

/** Значение cookie `name` из заголовка Cookie запроса. */
export function readCookieValue(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator > 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}

/** Сессия запроса по cookie; нет/битая/подделанная/отозванная/истёкшая → null. */
export function readRequestSession(request: Request, nowMs: number): VerifiedSession | null {
  return verifySessionToken(readCookieValue(request.headers.get("cookie"), SESSION_COOKIE), nowMs);
}

function isHttps(request: Request): boolean {
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return forwarded === "https" || new URL(request.url).protocol === "https:";
}

function serializeCookie(value: string, maxAgeSeconds: number, request: Request): string {
  const attributes = [
    `${SESSION_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps(request)) attributes.push("Secure");
  return attributes.join("; ");
}

/** Заголовок Set-Cookie входа. */
export function sessionSetCookie(token: string, request: Request): string {
  return serializeCookie(token, SESSION_TTL_SECONDS, request);
}

/** Заголовок Set-Cookie выхода: cookie очищается. */
export function sessionClearCookie(request: Request): string {
  return serializeCookie("", 0, request);
}
