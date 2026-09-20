"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useEffectEvent,
  useSyncExternalStore,
} from "react";

import type { AuthSession } from "@/shared/api";

import { watchSessionExpiry } from "./session-expiry";
import { sessionStore } from "./session-store";

/** Сессия, прочитанная сервером из cookie (серверный лэйаут → SessionProvider). */
export const SessionContext = createContext<AuthSession | null>(null);

const getUnknownSnapshot = (): undefined => undefined;

/**
 * Текущая сессия на клиенте. До гидратации — сессия, переданная сервером в SessionProvider;
 * после — из cookie-стора (выход/автовыход сразу дают null).
 */
export function useAuthSession(): AuthSession | null {
  const provided = useContext(SessionContext);
  const stored = useSyncExternalStore<AuthSession | null | undefined>(
    sessionStore.subscribe,
    sessionStore.get,
    getUnknownSnapshot,
  );
  return stored === undefined ? provided : stored;
}

/** Выход: очищает сессию (cookie). Навигацию на /login делает вызывающий (ссылка «выйти»). */
export function useLogout(): () => void {
  return useCallback(() => sessionStore.clear(), []);
}

/** Автовыход: по истечении 24 ч от issuedAt очищает сессию и вызывает onExpire (редирект на /login). */
export function useSessionExpiry(session: AuthSession | null, onExpire: () => void): void {
  const handleExpire = useEffectEvent(() => {
    sessionStore.clear();
    onExpire();
  });
  useEffect(() => {
    if (!session) return undefined;
    return watchSessionExpiry({ session, onExpire: handleExpire });
  }, [session]);
}
