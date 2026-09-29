"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { buildLoginHref, LOGIN_REASON_EXPIRED, SessionProvider } from "@/entities/user";
import type { PublicUser } from "@/entities/user";
import { setUnauthorizedHandler } from "@/shared/api";

type AuthSessionProviderProps = {
  /** Пользователь, подтверждённый сервером при рендере лэйаута раздела (verifySession). */
  user: PublicUser;
  children: ReactNode;
};

/**
 * Сессия раздела для клиентских компонентов + реакция на «сессия недействительна»: первый 401 любого запроса
 * (срок, выход на другом устройстве, блокировка администратором) уводит на /login «Сессия истекла» с возвратом
 * на текущую страницу. Таймера автовыхода нет — срок и отзыв определяет сервер.
 */
export function AuthSessionProvider({ user, children }: AuthSessionProviderProps) {
  const router = useRouter();
  useEffect(() => {
    setUnauthorizedHandler(() => {
      const { pathname, search } = window.location;
      router.replace(buildLoginHref(`${pathname}${search}`, LOGIN_REASON_EXPIRED));
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);
  return <SessionProvider user={user}>{children}</SessionProvider>;
}
