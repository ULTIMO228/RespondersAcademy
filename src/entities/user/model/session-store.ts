/*
 * Стор текущей auth-сессии (T2.1-01): set / restore / clear + подписка (useSyncExternalStore).
 * Хранилище — за интерфейсом KeyValueStorage (shared/lib): в браузере cookie, в тестах — память.
 */
import type { AuthSession } from "@/shared/api";
import { createCookieStorage, systemClock } from "@/shared/lib";
import type { Clock, KeyValueStorage } from "@/shared/lib";

import {
  getSessionMaxAgeSeconds,
  isSessionExpired,
  parseSession,
  serializeSession,
  SESSION_COOKIE,
} from "./session";

export interface SessionStore {
  /** Текущая сессия (при первом обращении восстанавливается из хранилища). */
  get(): AuthSession | null;
  /** Установить сессию после входа; пишет в хранилище с Max-Age до истечения 24 ч. */
  set(session: AuthSession): void;
  /** Перечитать хранилище (перезагрузка страницы); истёкшая сессия удаляется. */
  restore(): AuthSession | null;
  /** Выход: очистить хранилище и уведомить подписчиков. */
  clear(): void;
  subscribe(listener: () => void): () => void;
}

export interface SessionStoreDeps {
  storage: KeyValueStorage;
  clock?: Clock;
}

/** Сессия из хранилища; истёкшая (≥ 24 ч) удаляется. */
function readStoredSession(storage: KeyValueStorage, clock: Clock): AuthSession | null {
  const stored = parseSession(storage.get(SESSION_COOKIE));
  if (!stored || !isSessionExpired(stored, clock.now())) return stored;
  storage.remove(SESSION_COOKIE);
  return null;
}

export function createSessionStore({ storage, clock = systemClock }: SessionStoreDeps): SessionStore {
  const listeners = new Set<() => void>();
  let current: AuthSession | null = null;
  let isRestored = false;

  function notify(): void {
    listeners.forEach((listener) => listener());
  }

  function restore(): AuthSession | null {
    current = readStoredSession(storage, clock);
    isRestored = true;
    return current;
  }

  return {
    get: () => (isRestored ? current : restore()),
    set: (session) => {
      const maxAgeSeconds = getSessionMaxAgeSeconds(session, clock.now());
      storage.set(SESSION_COOKIE, serializeSession(session), { maxAgeSeconds });
      current = session;
      isRestored = true;
      notify();
    },
    restore: () => {
      const restored = restore();
      notify();
      return restored;
    },
    clear: () => {
      storage.remove(SESSION_COOKIE);
      current = null;
      isRestored = true;
      notify();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Стор браузера: cookie SESSION_COOKIE (на сервере document нет — стор пуст, сессию читает cookies()). */
export const sessionStore = createSessionStore({ storage: createCookieStorage() });
