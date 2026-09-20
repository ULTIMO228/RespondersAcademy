"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { buildLoginHref, LOGIN_REASON_EXPIRED, SessionProvider, useSessionExpiry } from "@/entities/user";
import type { AuthSession } from "@/entities/user";

type AuthSessionProviderProps = {
  /** Сессия, прочитанная серверным лэйаутом раздела из cookie. */
  session: AuthSession;
  children: ReactNode;
};

/** Сессия раздела для клиентских компонентов + автовыход через 24 ч (→ /login «Сессия истекла»). */
export function AuthSessionProvider({ session, children }: AuthSessionProviderProps) {
  const router = useRouter();
  useSessionExpiry(session, () => router.replace(buildLoginHref(undefined, LOGIN_REASON_EXPIRED)));
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
