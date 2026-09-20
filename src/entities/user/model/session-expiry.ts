/*
 * Автовыход через 24 ч (T2.1-08): фоновый отсчёт от AuthSession.issuedAt.
 * Проверка «догоняющая»: таймер не длиннее SESSION_EXPIRY_CHECK_MS, поэтому сон ноутбука
 * или троттлинг вкладки не продлевают сессию. Часы — Clock из shared/lib (подмена в тестах).
 */
import type { AuthSession } from "@/shared/api";
import { systemClock } from "@/shared/lib";
import type { Clock, TimerHandle } from "@/shared/lib";

import { getSessionExpiresAt } from "./session";

/** Максимальный шаг проверки истечения сессии. */
export const SESSION_EXPIRY_CHECK_MS = 30_000;

export interface SessionExpiryOptions {
  session: AuthSession;
  onExpire: () => void;
  clock?: Clock;
}

/** Запускает отсчёт; onExpire вызывается один раз. Возвращает функцию остановки (unmount/выход). */
export function watchSessionExpiry({
  session,
  onExpire,
  clock = systemClock,
}: SessionExpiryOptions): () => void {
  const expiresAt = getSessionExpiresAt(session);
  let handle: TimerHandle | null = null;

  function check(): void {
    const remaining = expiresAt - clock.now();
    if (remaining <= 0) {
      handle = null;
      onExpire();
      return;
    }
    handle = clock.setTimeout(check, Math.min(remaining, SESSION_EXPIRY_CHECK_MS));
  }

  check();
  return () => {
    if (handle !== null) clock.clearTimeout(handle);
    handle = null;
  };
}
