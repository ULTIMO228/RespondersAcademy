import { LOGIN_QUERY, LOGIN_REASON_EXPIRED } from "@/entities/user";
import type { UserRole } from "@/shared/api";

import { DEMO_ROLE_QUERY } from "../config/loginContent";
import { isUserRole } from "./authAccounts";

export type LoginSearchParams = Record<string, string | string[] | undefined>;

export type LoginParams = {
  returnUrl: string | null;
  isSessionExpired: boolean;
  demoRole: UserRole;
};

function readFirst(params: LoginSearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/** Параметры /login от гвардов (returnUrl, reason=expired) и демо-подсказок (demo=<роль>). */
export function readLoginParams(params: LoginSearchParams): LoginParams {
  const demoRole = readFirst(params, DEMO_ROLE_QUERY);
  return {
    returnUrl: readFirst(params, LOGIN_QUERY.returnUrl) ?? null,
    isSessionExpired: readFirst(params, LOGIN_QUERY.reason) === LOGIN_REASON_EXPIRED,
    demoRole: isUserRole(demoRole) ? demoRole : "student",
  };
}
