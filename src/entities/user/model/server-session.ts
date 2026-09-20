/*
 * Сессия на сервере (серверные компоненты/лэйауты): cookie SESSION_COOKIE → AuthSession + профиль.
 * Public API — index.server.ts (не импортировать в клиентские компоненты: next/headers + mocks/users.json).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthSession, PublicUser, UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { systemClock } from "@/shared/lib";

import { findUser } from "./demoUser";
import { buildLoginHref } from "./route-access";
import { isSessionExpired, parseSession, SESSION_COOKIE } from "./session";

const FALLBACK_PROFILE = { armNumber: 0, isActive: true } as const;

export interface SessionUser {
  session: AuthSession;
  /** Профиль пользователя сессии (без пароля). */
  user: PublicUser;
}

/** Текущая сессия из cookie запроса; нет, битая или истекла (24 ч) → null. */
export async function getServerSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies();
  const session = parseSession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || isSessionExpired(session, systemClock.now())) return null;
  return session;
}

function toPublicUser(session: AuthSession): PublicUser {
  const found = findUser(session.userId);
  // Учётка создана в рантайм-сторе мок-слоя (нет в статике) — показываем идентификатор.
  if (!found)
    return {
      ...FALLBACK_PROFILE,
      id: session.userId,
      login: session.userId,
      fullName: session.userId,
      role: session.role,
    };
  const { id, login, fullName, role, armNumber, isActive, group, service } = found;
  return { id, login, fullName, role, armNumber, isActive, group, service };
}

/** Сессия + профиль пользователя (шапка, блок оператора); без сессии → null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession();
  return session ? { session, user: toPublicUser(session) } : null;
}

/**
 * Гвард серверного лэйаута раздела (вторая линия после proxy): без сессии → /login,
 * роль не из матрицы раздела → /forbidden. Возвращает сессию и профиль.
 */
export async function requireSessionUser(role: UserRole): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(buildLoginHref());
  if (sessionUser.session.role !== role) redirect(ROUTES.forbidden);
  return sessionUser;
}
