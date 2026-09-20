"use client";

import type { ReactNode } from "react";

import type { AuthSession } from "@/shared/api";

import { SessionContext } from "../model/useAuthSession";

type SessionProviderProps = {
  /** Сессия из cookie, прочитанная серверным лэйаутом (getServerSession). */
  session: AuthSession | null;
  children: ReactNode;
};

/** Делает серверную сессию доступной клиентским компонентам до гидратации (useAuthSession). */
export function SessionProvider({ session, children }: SessionProviderProps) {
  return <SessionContext value={session}>{children}</SessionContext>;
}
