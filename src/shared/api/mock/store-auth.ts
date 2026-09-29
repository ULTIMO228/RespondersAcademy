/*
 * Реестр сессий мок-слоя и секрет подписи (паритет с таблицей auth_sessions бэкенда): выход и «выйти везде»
 * отзывают сессию по jti. Живёт на globalThis рядом с основным стором: раздельные бандлы route handlers Next.js
 * видят один реестр; перезапуск сервера сбрасывает сессии так же, как in-memory стор мок-слоя.
 */
import { randomBytes } from "node:crypto";

import { SERVER_ENV } from "@/shared/config";

export interface StoredAuthSession {
  userId: string;
  /** Конец жизни, мс с эпохи. */
  expiresAtMs: number;
  revokedAtMs: number | null;
}

interface AuthRegistry {
  secret: Buffer;
  sessions: Map<string, StoredAuthSession>;
}

const REGISTRY_KEY = Symbol.for("arm112.mockAuthRegistry");
const GENERATED_SECRET_BYTES = 32;

type GlobalWithRegistry = typeof globalThis & { [REGISTRY_KEY]?: AuthRegistry };

function createRegistry(): AuthRegistry {
  const configured = SERVER_ENV.mockSessionSecret;
  return {
    secret: configured ? Buffer.from(configured, "utf8") : randomBytes(GENERATED_SECRET_BYTES),
    sessions: new Map(),
  };
}

function getRegistry(): AuthRegistry {
  const holder = globalThis as GlobalWithRegistry;
  holder[REGISTRY_KEY] ??= createRegistry();
  return holder[REGISTRY_KEY];
}

export function getSessionSecret(): Buffer {
  return getRegistry().secret;
}

export function registerAuthSession(jti: string, session: StoredAuthSession): void {
  getRegistry().sessions.set(jti, session);
}

export function findAuthSession(jti: string): StoredAuthSession | undefined {
  return getRegistry().sessions.get(jti);
}

export function revokeAuthSession(jti: string, nowMs: number): void {
  const session = getRegistry().sessions.get(jti);
  if (session && session.revokedAtMs === null) session.revokedAtMs = nowMs;
}

/** Отзыв всех сессий пользователя; `keepJti` — сессия, которая остаётся (смена пароля). */
export function revokeUserAuthSessions(userId: string, nowMs: number, keepJti?: string): void {
  for (const [jti, session] of getRegistry().sessions) {
    if (session.userId === userId && jti !== keepJti && session.revokedAtMs === null) {
      session.revokedAtMs = nowMs;
    }
  }
}

/** Сброс реестра сессий (тесты); секрет сохраняется. */
export function resetAuthSessions(): void {
  getRegistry().sessions.clear();
}
