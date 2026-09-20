import { ApiError, apiClient } from "../client";
import type { ApiClient } from "../client";
import type { AuthPolicy, AuthSession, LoginRequest } from "../types";
import { API_PATHS } from "./paths";

/** Причина отказа входа — для UI (сообщения не раскрывают, что именно неверно). */
export type LoginFailureReason = "invalid" | "blocked" | "validation" | "network" | "unknown";

export interface LoginFailure {
  reason: LoginFailureReason;
  message: string;
}

/** Тексты отказов входа дословно по spec/04-pages/00-auth.md «Поведение». */
export const LOGIN_FAILURE_MESSAGES = {
  invalid: "Неверный логин или пароль",
  blocked: "Учётная запись заблокирована. Обратитесь к администратору",
  unknown: "Не удалось выполнить вход. Повторите попытку",
} as const;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const NETWORK_STATUS = 0;

/**
 * POST /auth/login → AuthSession; 401 «Неверный логин или пароль», 403 — учётка заблокирована.
 * `client` подменяется в тестах (createApiClient({ fetcher })).
 */
export function login(credentials: LoginRequest, client: ApiClient = apiClient): Promise<AuthSession> {
  return client.post<AuthSession>(API_PATHS.login, credentials);
}

/**
 * GET /auth/policy → политика входа (2FA, длина пароля, порог блокировки). Форма `/login` читает
 * её, чтобы уважать настройку администратора «Требовать 2FA» (T4.2-17).
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
    case HTTP_BAD_REQUEST:
      return { reason: "validation", message: error.message };
    case NETWORK_STATUS:
      return { reason: "network", message: error.message };
    default:
      return { reason: "unknown", message: LOGIN_FAILURE_MESSAGES.unknown };
  }
}
