/*
 * Резолвер целевого роута после входа (T2.1-06): returnUrl от гварда → иначе раздел роли.
 * returnUrl принимается только как внутренний путь (без open-redirect) и только если роль имеет к нему доступ.
 */
import { canAccessRoute } from "@/entities/user";
import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

import { ROLE_HOME } from "../config/authConfig";

const INTERNAL_ORIGIN = "http://arm112.internal";

function toInternalUrl(raw: string): URL | null {
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  try {
    const url = new URL(raw, INTERNAL_ORIGIN);
    return url.origin === INTERNAL_ORIGIN ? url : null;
  } catch {
    return null;
  }
}

/** Внутренний путь из returnUrl («/arm/card/x?tab=1») или null (внешний, протокольный, /login). */
export function sanitizeReturnUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const url = toInternalUrl(raw);
  if (!url || url.pathname === ROUTES.login) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

export function resolvePostLoginRoute(role: UserRole, returnUrl?: string | null): string {
  const safeReturnUrl = sanitizeReturnUrl(returnUrl);
  if (!safeReturnUrl) return ROLE_HOME[role];
  const { pathname } = new URL(safeReturnUrl, INTERNAL_ORIGIN);
  return canAccessRoute(role, pathname) ? safeReturnUrl : ROLE_HOME[role];
}
