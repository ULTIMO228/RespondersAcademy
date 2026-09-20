/*
 * apiClient — fetch-обёртка над мок-слоем /api/mock/* (базовый URL — shared/config).
 * Компоненты и хуки не знают про fetch/URL: только доменные функции endpoints/*.ts.
 * Ошибки: любой не-2xx → ApiError (status + код + ru-сообщение из единого формата { error: { code, message } }).
 */
import { APP_ENV } from "@/shared/config";

import type { ApiErrorBody, ApiErrorCode, QueryParams, QueryScalar } from "./types";

const NETWORK_ERROR_STATUS = 0;

const FALLBACK_ERRORS: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: "badRequest", message: "Некорректный запрос" },
  401: { code: "unauthorized", message: "Требуется вход в систему" },
  403: { code: "forbidden", message: "Недостаточно прав" },
  404: { code: "notFound", message: "Данные не найдены" },
  409: { code: "conflict", message: "Действие недоступно в текущем состоянии" },
};
const INTERNAL_FALLBACK = { code: "internal", message: "Ошибка сервера. Повторите попытку позже" } as const;
const NETWORK_ERROR_MESSAGE = "Нет соединения с сервером";

/** Типизированная ошибка API: исходный HTTP-статус (0 — сеть), машинный код и ru-сообщение для UI. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

function isApiErrorBody(candidate: unknown): candidate is ApiErrorBody {
  if (typeof candidate !== "object" || candidate === null || !("error" in candidate)) return false;
  const { error } = candidate as { error: unknown };
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { message?: unknown }).message === "string"
  );
}

function appendQueryValue(search: URLSearchParams, key: string, scalar: QueryScalar): void {
  const serialized = String(scalar);
  if (serialized !== "") search.append(key, serialized);
}

/** "?a=1&a=2&q=%D0%AE%D0%90%D0%9E" — кириллица кодируется, массив → повторные ключи; пустое опускается. */
export function buildQuery(params?: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    const scalars: readonly QueryScalar[] = Array.isArray(value) ? value : [value as QueryScalar];
    scalars.forEach((scalar) => appendQueryValue(search, key, scalar));
  }
  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
}

async function toApiError(response: Response): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  if (isApiErrorBody(payload))
    return new ApiError(response.status, payload.error.code, payload.error.message);
  const fallback = FALLBACK_ERRORS[response.status] ?? INTERNAL_FALLBACK;
  return new ApiError(response.status, fallback.code, fallback.message);
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: QueryParams;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Подмена fetch (тесты, SSR). По умолчанию — глобальный fetch на момент вызова. */
  fetcher?: typeof fetch;
}

export interface ApiClient {
  request<TResponse>(path: string, options?: ApiRequestOptions): Promise<TResponse>;
  get<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse>;
  post<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  patch<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  put<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  /** DELETE: тела у запроса нет — параметры передаются query-строкой. */
  remove<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  async function request<TResponse>(path: string, options: ApiRequestOptions = {}): Promise<TResponse> {
    const { method = "GET", query, body, signal } = options;
    const fetcher = config.fetcher ?? fetch;
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl}${path}${buildQuery(query)}`, {
        method,
        signal,
        headers: body === undefined ? undefined : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(NETWORK_ERROR_STATUS, "networkError", NETWORK_ERROR_MESSAGE);
    }
    if (!response.ok) throw await toApiError(response);
    return (await response.json()) as TResponse;
  }
  function get<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { query, signal });
  }
  function post<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "POST", body, signal });
  }
  function patch<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "PATCH", body, signal });
  }
  function put<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "PUT", body, signal });
  }
  function remove<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "DELETE", query, signal });
  }
  return { request, get, post, patch, put, remove };
}

/** Клиент по умолчанию: baseUrl = NEXT_PUBLIC_MOCK_API_BASE_URL (дефолт "/api/mock"). */
export const apiClient = createApiClient({ baseUrl: APP_ENV.mockApiBaseUrl });
