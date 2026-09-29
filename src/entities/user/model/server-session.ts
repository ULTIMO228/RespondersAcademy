/*
 * Слой доступа к сессии на сервере Next (DAL, руководство Next.js «Authentication»: оптимистичная проверка — в proxy,
 * основная — здесь). Cookie выдаёт бэкенд (или мок-слой): подпись и отзыв проверяет он, а не Next. Профиль пользователя
 * берётся запросом GET /auth/session на СОБСТВЕННЫЙ origin с пробросом cookie: запрос обслуживает бэкенд по rewrite
 * (задан BACKEND_URL) либо мок-обработчик — один код для обоих режимов, BACKEND_URL здесь не читается (AGENTS §6).
 * Public API — index.server.ts (не импортировать в клиентские компоненты: next/headers).
 */
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import type { PublicUser, UserRole } from "@/shared/api";
import { APP_ENV, ROUTES } from "@/shared/config";

import { buildLoginHref } from "./route-access";
import { RETURN_URL_HEADER, SESSION_COOKIE } from "./session";

const HTTP_UNAUTHORIZED = 401;
const SESSION_PATH = "/auth/session";

export interface SessionUser {
  /** Профиль пользователя сессии (без пароля) — ответ сервера. */
  user: PublicUser;
}

/** Ошибка проверки сессии не из-за самой сессии (нет связи с сервером, 5xx): показывается страницей ошибки, не входом. */
export class SessionVerificationError extends Error {
  constructor(status: number) {
    super(`Не удалось проверить сессию: сервер ответил ${status}`);
    this.name = "SessionVerificationError";
  }
}

/** Адрес запроса профиля: база API (относительная — от origin текущего запроса; абсолютная — как есть). */
async function resolveSessionUrl(): Promise<string> {
  const base = APP_ENV.mockApiBaseUrl.replace(/\/+$/, "");
  if (/^https?:\/\//.test(base)) return `${base}${SESSION_PATH}`;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${protocol}://${host}${base}${SESSION_PATH}`;
}

/**
 * Профиль по cookie запроса; нет cookie или сервер ответил 401 (подделка, срок, отзыв, блокировка) → null.
 * Результат кэшируется на время рендера (React.cache): лэйаут и страница делают один запрос.
 */
const fetchSessionUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const response = await fetch(await resolveSessionUrl(), {
    headers: { cookie: `${SESSION_COOKIE}=${token}` },
    cache: "no-store",
  });
  if (response.status === HTTP_UNAUTHORIZED) return null;
  if (!response.ok) throw new SessionVerificationError(response.status);
  return (await response.json()) as PublicUser;
});

/** Сессия + профиль (шапка, блок оператора); без действующей сессии → null (без редиректа). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const user = await fetchSessionUser();
  return user ? { user } : null;
}

/** Куда вернуть после входа: проставляет proxy; в лэйауте вне зоны proxy — без возврата. */
async function readReturnUrl(): Promise<string | undefined> {
  return (await headers()).get(RETURN_URL_HEADER) ?? undefined;
}

/**
 * Гвард серверного лэйаута/страницы: сервер подтвердил сессию, иначе → /login?reason=expired&returnUrl=….
 * Кэшируется на рендер.
 */
export const verifySession = cache(async (): Promise<SessionUser> => {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect(buildLoginHref(await readReturnUrl(), "expired"));
  return sessionUser;
});

/** verifySession + роль раздела (вторая линия после proxy): чужая роль → /forbidden. */
export async function requireSessionUser(role: UserRole): Promise<SessionUser> {
  const sessionUser = await verifySession();
  if (sessionUser.user.role !== role) redirect(ROUTES.forbidden);
  return sessionUser;
}
