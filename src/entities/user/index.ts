/* Клиент-безопасный public API (серверные функции — "@/entities/user/index.server"). */
export type { AuthSession, PublicUser, Role, User, UserRole } from "@/shared/api";
export { ROLE_ACCESS_ROWS, ROLE_ORDER } from "./config/roleAccess";
export type { RoleAccess, RoleAccessRow } from "./config/roleAccess";
export { formatShortName, ROLE_TITLES } from "./model/roles";
export { getSessionExpiresAt, isSessionExpired, parseSession, serializeSession } from "./model/session";
export { SESSION_COOKIE, SESSION_TTL_MS } from "./model/session";
export { createSessionStore, sessionStore } from "./model/session-store";
export type { SessionStore, SessionStoreDeps } from "./model/session-store";
export { SESSION_EXPIRY_CHECK_MS, watchSessionExpiry } from "./model/session-expiry";
export { buildLoginHref, canAccessRoute, isProtectedPath, LOGIN_QUERY } from "./model/route-access";
export { LOGIN_REASON_EXPIRED, resolveRouteAccess } from "./model/route-access";
export type { RouteAccess } from "./model/route-access";
export { useAuthSession, useLogout, useSessionExpiry } from "./model/useAuthSession";
export { LogoutLink } from "./ui/LogoutLink";
export { RoleMatrix } from "./ui/RoleMatrix";
export { SessionProvider } from "./ui/SessionProvider";
export { UserRow } from "./ui/UserRow";
