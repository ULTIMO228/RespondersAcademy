"use client";

import type { ReactNode } from "react";

import type { PublicUser } from "@/shared/api";

import { SessionContext } from "../model/useSessionUser";

type SessionProviderProps = {
  /** Пользователь, подтверждённый сервером при рендере лэйаута (verifySession). */
  user: PublicUser | null;
  children: ReactNode;
};

/** Делает пользователя сессии доступным клиентским компонентам (useSessionUser). */
export function SessionProvider({ user, children }: SessionProviderProps) {
  return <SessionContext value={user}>{children}</SessionContext>;
}
