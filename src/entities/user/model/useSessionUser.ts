"use client";

import { createContext, useCallback, useContext } from "react";

import { logout, logoutAll } from "@/shared/api";
import type { PublicUser } from "@/shared/api";

/** Профиль пользователя сессии, подтверждённый сервером (серверный лэйаут → SessionProvider). */
export const SessionContext = createContext<PublicUser | null>(null);

/** Пользователь текущей сессии на клиенте; вне защищённых лэйаутов — null. Сам токен клиенту недоступен (HttpOnly). */
export function useSessionUser(): PublicUser | null {
  return useContext(SessionContext);
}

/**
 * Выход: сервер отзывает сессию и очищает cookie (POST /auth/logout). Ошибка сети не блокирует уход на /login —
 * без cookie proxy всё равно не пустит в раздел, а cookie с отозванной сессией сервер отвергнет (401).
 */
export function useLogout(): () => Promise<void> {
  return useCallback(async () => {
    try {
      await logout();
    } catch {
      // выход best-effort: вызывающий всё равно ведёт на /login
    }
  }, []);
}

/**
 * «Выйти на всех устройствах»: сервер отзывает все сессии пользователя, включая текущую, и очищает cookie
 * (POST /auth/logout-all). В отличие от обычного выхода ошибку не скрываем — пользователь должен знать, что сессии живы.
 */
export function useLogoutAll(): () => Promise<void> {
  return useCallback(() => logoutAll(), []);
}
