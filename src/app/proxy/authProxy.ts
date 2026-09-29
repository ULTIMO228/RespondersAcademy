/*
 * Гвард роутов (T2.1-07) на уровне Next 16 Proxy (бывший middleware): ОПТИМИСТИЧНАЯ проверка cookie сессии до рендера,
 * по матрице spec/000-фронт/02-roles.md. Cookie — подписанный JWT, выданный сервером; proxy читает из него наличие,
 * срок и роль БЕЗ проверки подписи (секрет у бэкенда) и потому не считается защитой данных: подлинность сессии
 * проверяет verifySession() на сервере при рендере (entities/user/index.server) и бэкенд на каждом запросе к API.
 * Без cookie → /login?returnUrl=…; срок истёк → /login с reason=expired и удалением cookie; чужая роль → rewrite на
 * /forbidden со статусом 403. В запрос проставляется заголовок возврата для серверных лэйаутов.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildLoginHref,
  LOGIN_REASON_EXPIRED,
  readSessionClaims,
  resolveRouteAccess,
  RETURN_URL_HEADER,
  SESSION_COOKIE,
} from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { systemClock } from "@/shared/lib";

const HTTP_FORBIDDEN = 403;

export function authProxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const claims = readSessionClaims(request.cookies.get(SESSION_COOKIE)?.value);
  const access = resolveRouteAccess(pathname, claims, systemClock.now());
  if (access === "unauthenticated" || access === "expired") {
    const reason = access === "expired" ? LOGIN_REASON_EXPIRED : undefined;
    const response = NextResponse.redirect(
      new URL(buildLoginHref(`${pathname}${search}`, reason), request.url),
    );
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (access === "forbidden") {
    return NextResponse.rewrite(new URL(ROUTES.forbidden, request.url), { status: HTTP_FORBIDDEN });
  }
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(RETURN_URL_HEADER, `${pathname}${search}`);
  return NextResponse.next({ request: { headers: requestHeaders } });
}
