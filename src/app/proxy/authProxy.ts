/*
 * Гвард роутов (T2.1-07) на уровне Next 16 Proxy (бывший middleware): оптимистичная проверка cookie-сессии
 * до рендера, по матрице spec/000-фронт/02-roles.md. Без сессии → /login?returnUrl=…; истекла (24 ч) → /login с
 * reason=expired и удалением cookie; чужая роль → rewrite на /forbidden со статусом 403.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  buildLoginHref,
  LOGIN_REASON_EXPIRED,
  parseSession,
  resolveRouteAccess,
  SESSION_COOKIE,
} from "@/entities/user";
import { ROUTES } from "@/shared/config";
import { systemClock } from "@/shared/lib";

const HTTP_FORBIDDEN = 403;

export function authProxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  const session = parseSession(request.cookies.get(SESSION_COOKIE)?.value);
  const access = resolveRouteAccess(pathname, session, systemClock.now());
  if (access === "unauthenticated" || access === "expired") {
    const reason = access === "expired" ? LOGIN_REASON_EXPIRED : undefined;
    const response = NextResponse.redirect(
      new URL(buildLoginHref(`${pathname}${search}`, reason), request.url),
    );
    if (access === "expired") response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (access === "forbidden") {
    return NextResponse.rewrite(new URL(ROUTES.forbidden, request.url), { status: HTTP_FORBIDDEN });
  }
  return NextResponse.next();
}
