/*
 * Гвард роутов по матрице доступа spec/000-фронт/02-roles.md (ROLE_ACCESS_ROWS — единственный источник).
 * Чистые функции: используются proxy (сервер), серверными лэйаутами и резолвером редиректа входа.
 */
import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import { ROLE_ACCESS_ROWS } from "../config/roleAccess";
import type { RoleAccessRow } from "../config/roleAccess";
import { isSessionExpired } from "./session";
import type { SessionClaims } from "./session";

/** public — роут вне матрицы; unauthenticated/expired → /login; forbidden → 403. */
export type RouteAccess = "public" | "allowed" | "unauthenticated" | "expired" | "forbidden";

/** Query-параметры /login, которые выставляют гварды. */
export const LOGIN_QUERY = { returnUrl: "returnUrl", reason: "reason" } as const;
export const LOGIN_REASON_EXPIRED = "expired";

const DYNAMIC_SEGMENT = /^\[.+\]$/;

function toSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

function matchesRow(pathSegments: string[], row: RoleAccessRow): boolean {
  const routeSegments = toSegments(row.route);
  if (pathSegments.length < routeSegments.length) return false;
  return routeSegments.every(
    (segment, index) => DYNAMIC_SEGMENT.test(segment) || segment === pathSegments[index],
  );
}

/** Самая специфичная строка матрицы для пути (префикс по сегментам). */
function findAccessRow(pathSegments: string[]): RoleAccessRow | undefined {
  return ROLE_ACCESS_ROWS.filter((row) => matchesRow(pathSegments, row)).sort(
    (left, right) => toSegments(right.route).length - toSegments(left.route).length,
  )[0];
}

/** Строки защищённого раздела (/arm, /teacher, /admin) — всё, кроме /login. */
function getSectionRows(section: string): RoleAccessRow[] {
  return ROLE_ACCESS_ROWS.filter((row) => row.route !== ROUTES.login && toSegments(row.route)[0] === section);
}

export function isProtectedPath(pathname: string): boolean {
  const [section] = toSegments(pathname);
  return section !== undefined && getSectionRows(section).length > 0;
}

/** Доступна ли роль к пути по матрице (раздел без своей строки, напр. /admin, — по строкам раздела). */
export function canAccessRoute(role: UserRole, pathname: string): boolean {
  const segments = toSegments(pathname);
  const row = findAccessRow(segments);
  if (row) return row.access[role].allowed;
  const sectionRows = segments.length > 0 ? getSectionRows(segments[0]) : [];
  return sectionRows.length === 0 || sectionRows.some((sectionRow) => sectionRow.access[role].allowed);
}

/** Оптимистичное решение по заявленным полям токена (без проверки подписи); полная проверка — verifySession(). */
export function resolveRouteAccess(
  pathname: string,
  session: SessionClaims | null,
  nowMs: number,
): RouteAccess {
  if (!isProtectedPath(pathname)) return "public";
  if (!session) return "unauthenticated";
  if (isSessionExpired(session, nowMs)) return "expired";
  return canAccessRoute(session.role, pathname) ? "allowed" : "forbidden";
}

/** «/login?returnUrl=…&reason=expired» — вход, инициированный гвардом или автовыходом. */
export function buildLoginHref(returnUrl?: string, reason?: typeof LOGIN_REASON_EXPIRED): string {
  const query = new URLSearchParams();
  if (returnUrl) query.set(LOGIN_QUERY.returnUrl, returnUrl);
  if (reason) query.set(LOGIN_QUERY.reason, reason);
  const serialized = query.toString();
  return serialized ? `${ROUTES.login}?${serialized}` : ROUTES.login;
}
