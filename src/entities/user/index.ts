/* Клиент-безопасный public API (серверные функции — "@/entities/user/index.server"). */
export type { PublicUser, Role, User, UserRole } from "@/shared/api";
export { ROLE_ACCESS_ROWS, ROLE_ORDER } from "./config/roleAccess";
export type { RoleAccess, RoleAccessRow } from "./config/roleAccess";
export { formatShortName, ROLE_TITLES } from "./model/roles";
export { isSessionExpired, readSessionClaims, RETURN_URL_HEADER } from "./model/session";
export { SESSION_COOKIE, SESSION_TTL_SECONDS } from "./model/session";
export type { SessionClaims } from "./model/session";
export { buildLoginHref, canAccessRoute, isProtectedPath, LOGIN_QUERY } from "./model/route-access";
export { LOGIN_REASON_EXPIRED, resolveRouteAccess } from "./model/route-access";
export type { RouteAccess } from "./model/route-access";
export { useLogout, useLogoutAll, useSessionUser } from "./model/useSessionUser";
export { LogoutLink } from "./ui/LogoutLink";
export { RoleMatrix } from "./ui/RoleMatrix";
export { SessionProvider } from "./ui/SessionProvider";
export { UserRow } from "./ui/UserRow";
