/*
 * apiClient — fetch-обёртка над мок-слоем /api/mock/* (базовый URL — shared/config).
 * Компоненты и хуки не знают про fetch/URL: только доменные функции endpoints/*.ts.
 * Ошибки: любой не-2xx → ApiError (status + код + ru-сообщение из единого формата { error: { code, message } }).
 * Клиент с requiresServer (пути /api/v1/* вне ai/*) превращает «пустой» 404 в ServerRequiredError.
 */
import { APP_ENV } from "@/shared/config";

import type { ApiErrorBody, ApiErrorCode, QueryParams, QueryScalar } from "./types";

const NETWORK_ERROR_STATUS = 0;
const HTTP_UNAUTHORIZED = 401;
const HTTP_NO_CONTENT = 204;
/** Пути, где 401 — штатный ответ (неверный пароль, выход без сессии), а не «сессия истекла». */
const UNAUTHORIZED_EXEMPT_PATHS = ["/auth/login", "/auth/logout"] as const;

const FALLBACK_ERRORS: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: "badRequest", message: "Некорректный запрос" },
  401: { code: "unauthorized", message: "Требуется вход в систему" },
  403: { code: "forbidden", message: "Недостаточно прав" },
  404: { code: "notFound", message: "Данные не найдены" },
  409: { code: "conflict", message: "Действие недоступно в текущем состоянии" },
};
const INTERNAL_FALLBACK = { code: "internal", message: "Ошибка сервера. Повторите попытку позже" } as const;
const NETWORK_ERROR_MESSAGE = "Нет соединения с сервером";
export const SERVER_REQUIRED_MESSAGE = "Раздел требует подключения к серверу тренажёра";

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

/**
 * Раздел работает только с бэкендом: Next без BACKEND_URL на /api/v1/* отвечает 404 без тела { error: { code } }
 * (бэкенд отдаёт код всегда, поэтому «404 по данным» от «бэкенда нет» отличается именно телом).
 * Сетевой сбой сюда не входит: на том же origin он значит «нет связи» (ConnectionBanner), а не «нет бэкенда».
 */
export class ServerRequiredError extends ApiError {
  constructor() {
    super(404, "serverRequired", SERVER_REQUIRED_MESSAGE);
    this.name = "ServerRequiredError";
  }
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Реакция на «сессия недействительна»: 401 на любом запросе, кроме входа и выхода, вызывает обработчик один раз
 * (лэйаут раздела регистрирует переход на /login?reason=expired). `null` — снять обработчик.
 */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

function notifyUnauthorized(path: string): void {
  if (UNAUTHORIZED_EXEMPT_PATHS.some((exempt) => path.startsWith(exempt))) return;
  const handler = unauthorizedHandler;
  unauthorizedHandler = null;
  handler?.();
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

async function toApiError(response: Response, requiresServer: boolean): Promise<ApiError> {
  const payload: unknown = await response.json().catch(() => null);
  if (isApiErrorBody(payload))
    return new ApiError(response.status, payload.error.code, payload.error.message);
  if (requiresServer && response.status === 404) return new ServerRequiredError();
  const fallback = FALLBACK_ERRORS[response.status] ?? INTERNAL_FALLBACK;
  return new ApiError(response.status, fallback.code, fallback.message);
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: QueryParams;
  body?: unknown;
  /** multipart-тело: передаётся как есть, без JSON и без ручного Content-Type. */
  form?: FormData;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  baseUrl: string;
  /** Пути клиента обслуживает только бэкенд: 404 без { error } → ServerRequiredError. */
  requiresServer?: boolean;
  /** Подмена fetch (тесты, SSR). По умолчанию — глобальный fetch на момент вызова. */
  fetcher?: typeof fetch;
}

export interface ApiClient {
  request<TResponse>(path: string, options?: ApiRequestOptions): Promise<TResponse>;
  get<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse>;
  /** GET двоичного ответа (аудио): тот же разбор ошибок, тело — Blob. Один запрос = один учтённый доступ. */
  getBlob(path: string, signal?: AbortSignal): Promise<Blob>;
  post<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  /** POST multipart/form-data (загрузка файла); Content-Type с границей проставляет браузер. */
  postForm<TResponse>(path: string, form: FormData, signal?: AbortSignal): Promise<TResponse>;
  patch<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  put<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse>;
  /** DELETE: тела у запроса нет — параметры передаются query-строкой. */
  remove<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse>;
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  async function send(path: string, options: ApiRequestOptions): Promise<Response> {
    const { method = "GET", query, body, form, signal } = options;
    const fetcher = config.fetcher ?? fetch;
    let response: Response;
    try {
      response = await fetcher(`${config.baseUrl}${path}${buildQuery(query)}`, {
        method,
        signal,
        headers: body === undefined || form ? undefined : { "content-type": "application/json" },
        body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(NETWORK_ERROR_STATUS, "networkError", NETWORK_ERROR_MESSAGE);
    }
    if (!response.ok) {
      if (response.status === HTTP_UNAUTHORIZED) notifyUnauthorized(path);
      throw await toApiError(response, config.requiresServer ?? false);
    }
    return response;
  }
  async function request<TResponse>(path: string, options: ApiRequestOptions = {}): Promise<TResponse> {
    const response = await send(path, options);
    if (response.status === HTTP_NO_CONTENT) return undefined as TResponse;
    return (await response.json()) as TResponse;
  }
  async function getBlob(path: string, signal?: AbortSignal): Promise<Blob> {
    return (await send(path, { signal })).blob();
  }
  function get<TResponse>(path: string, query?: QueryParams, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { query, signal });
  }
  function post<TResponse>(path: string, body?: unknown, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "POST", body, signal });
  }
  function postForm<TResponse>(path: string, form: FormData, signal?: AbortSignal): Promise<TResponse> {
    return request<TResponse>(path, { method: "POST", form, signal });
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
  return { request, get, getBlob, post, postForm, patch, put, remove };
}

/** Клиент по умолчанию: baseUrl = NEXT_PUBLIC_MOCK_API_BASE_URL (дефолт "/api/mock"). */
export const apiClient = createApiClient({ baseUrl: APP_ENV.mockApiBaseUrl });
