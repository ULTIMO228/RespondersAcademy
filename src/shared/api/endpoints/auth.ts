import { ApiError, apiClient } from "../client";
import type { ApiClient } from "../client";
import type { AuthPolicy, ChangePasswordRequest, LoginRequest, PublicUser, Role } from "../types";
import { API_PATHS } from "./paths";

/** Причина отказа входа — для UI (сообщения не раскрывают, что именно неверно). */
export type LoginFailureReason = "invalid" | "blocked" | "rateLimited" | "validation" | "network" | "unknown";

export interface LoginFailure {
  reason: LoginFailureReason;
  message: string;
}

/** Тексты отказов входа дословно по spec/000-фронт/04-pages/00-auth.md «Поведение». */
export const LOGIN_FAILURE_MESSAGES = {
  invalid: "Неверный логин или пароль",
  blocked: "Учётная запись заблокирована. Обратитесь к администратору",
  rateLimited: "Слишком много попыток входа. Повторите позже",
  unknown: "Не удалось выполнить вход. Повторите попытку",
} as const;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;
const NETWORK_STATUS = 0;

/** Результат входа для клиента: кто вошёл. Токен из тела ответа клиент не сохраняет — cookie ставит сервер (HttpOnly). */
export interface LoginResult {
  userId: string;
  role: Role;
}

/**
 * POST /auth/login → { userId, role }; 401 «Неверный логин или пароль», 403 — учётка заблокирована.
 * Сессию выдаёт сервер заголовком Set-Cookie; поле `token` тела ответа отбрасывается.
 * `client` подменяется в тестах (createApiClient({ fetcher })).
 */
export async function login(credentials: LoginRequest, client: ApiClient = apiClient): Promise<LoginResult> {
  const { userId, role } = await client.post<LoginResult>(API_PATHS.login, credentials);
  return { userId, role };
}

/** GET /auth/session → профиль пользователя текущей сессии; 401 — сессии нет или она отозвана. */
export function getSession(client: ApiClient = apiClient, signal?: AbortSignal): Promise<PublicUser> {
  return client.get<PublicUser>(API_PATHS.authSession, undefined, signal);
}

/** POST /auth/logout → 204: сессия отзывается, cookie очищает сервер. */
export function logout(client: ApiClient = apiClient): Promise<void> {
  return client.post<void>(API_PATHS.logout);
}

/** POST /auth/logout-all → 204: «Выйти на всех устройствах» (включая текущее). */
export function logoutAll(client: ApiClient = apiClient): Promise<void> {
  return client.post<void>(API_PATHS.logoutAll);
}

/** POST /auth/password → 204; 400 — неверный текущий пароль или пароль не проходит политику. Прочие сессии завершаются. */
export function changePassword(body: ChangePasswordRequest, client: ApiClient = apiClient): Promise<void> {
  return client.post<void>(API_PATHS.changePassword, body);
}

/**
 * GET /auth/policy → политика парольного входа (длина пароля, порог блокировки).
 */
export function getAuthPolicy(client: ApiClient = apiClient, signal?: AbortSignal): Promise<AuthPolicy> {
  return client.get<AuthPolicy>(API_PATHS.authPolicy, undefined, signal);
}

/** Маппер ошибки login-клиента → причина + ru-сообщение для формы входа. */
export function mapLoginError(error: unknown): LoginFailure {
  if (!(error instanceof ApiError)) return { reason: "unknown", message: LOGIN_FAILURE_MESSAGES.unknown };
  switch (error.status) {
    case HTTP_UNAUTHORIZED:
      return { reason: "invalid", message: LOGIN_FAILURE_MESSAGES.invalid };
    case HTTP_FORBIDDEN:
      return { reason: "blocked", message: LOGIN_FAILURE_MESSAGES.blocked };
    case HTTP_TOO_MANY_REQUESTS:
      return { reason: "rateLimited", message: LOGIN_FAILURE_MESSAGES.rateLimited };
    case HTTP_BAD_REQUEST:
      return { reason: "validation", message: error.message };
    case NETWORK_STATUS:
      return { reason: "network", message: error.message };
    default:
      return { reason: "unknown", message: LOGIN_FAILURE_MESSAGES.unknown };
  }
}
