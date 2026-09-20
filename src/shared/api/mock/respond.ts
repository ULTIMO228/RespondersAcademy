/*
 * Единый формат ответов мок-слоя.
 * Успех — сами данные (Response.json); ошибка — `{ error: { code, message } }` (ApiErrorBody), message по-русски.
 * Доменная логика бросает MockApiError; handler оборачивается в withErrorHandling и не знает о статусах.
 */
import { StatusTransitionError } from "@/shared/lib";

import type { ApiErrorBody, ApiErrorCode } from "../types";

export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  /** Значения полей нарушают нормативы ТЗ (настройки системы, T4.2-04). */
  unprocessable: 422,
  internal: 500,
} as const;

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS];

const INTERNAL_ERROR_MESSAGE = "Внутренняя ошибка мок-сервера";

/** Ошибка мок-слоя с HTTP-статусом и машинным кодом. */
export class MockApiError extends Error {
  readonly status: HttpStatus;
  readonly code: ApiErrorCode;

  constructor(status: HttpStatus, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "MockApiError";
    this.status = status;
    this.code = code;
  }
}

export function jsonOk<TData>(payload: TData, status: HttpStatus = HTTP_STATUS.ok): Response {
  return Response.json(payload, { status });
}

export function jsonCreated<TData>(payload: TData): Response {
  return jsonOk(payload, HTTP_STATUS.created);
}

export function jsonError(status: HttpStatus, code: ApiErrorCode, message: string): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status });
}

/**
 * Доменная ошибка машины статусов (shared/lib/status-machine) → HTTP: недопустимый переход — 409
 * invalidTransition; неизвестный статус и отсутствие обязательного комментария — 400 validationFailed.
 */
function fromStatusTransitionError(error: StatusTransitionError): MockApiError {
  if (error.code === "invalidTransition") {
    return new MockApiError(HTTP_STATUS.conflict, "invalidTransition", error.message);
  }
  return new MockApiError(HTTP_STATUS.badRequest, "validationFailed", error.message);
}

/**
 * MockApiError → его статус/код; StatusTransitionError → 409/400 (см. выше);
 * всё прочее → 500 internal (детали наружу не отдаём).
 */
export function toErrorResponse(error: unknown): Response {
  const known = error instanceof StatusTransitionError ? fromStatusTransitionError(error) : error;
  if (known instanceof MockApiError) return jsonError(known.status, known.code, known.message);
  return jsonError(HTTP_STATUS.internal, "internal", INTERNAL_ERROR_MESSAGE);
}

/** Обёртка route handler'а: перехватывает MockApiError и прочие исключения в единый формат ошибки. */
export function withErrorHandling<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Response | Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    try {
      return await handler(...args);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

/* Фабрики типовых ошибок (сообщения — по-русски, конкретные для случая). */
export const badRequest = (message: string) =>
  new MockApiError(HTTP_STATUS.badRequest, "badRequest", message);
export const validationFailed = (message: string) =>
  new MockApiError(HTTP_STATUS.badRequest, "validationFailed", message);
export const unauthorized = (message: string) =>
  new MockApiError(HTTP_STATUS.unauthorized, "unauthorized", message);
export const forbidden = (message: string) => new MockApiError(HTTP_STATUS.forbidden, "forbidden", message);
export const notFound = (message: string) => new MockApiError(HTTP_STATUS.notFound, "notFound", message);
export const conflict = (message: string) => new MockApiError(HTTP_STATUS.conflict, "conflict", message);
/** 422: поля не прошли нормативы ТЗ — сообщение перечисляет нарушенные поля (T4.2-04). */
export const unprocessable = (message: string) =>
  new MockApiError(HTTP_STATUS.unprocessable, "validationFailed", message);
