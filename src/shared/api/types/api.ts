/*
 * Транспортные контракты мок-слоя /api/mock/* (общие для route handlers и клиента shared/api).
 * Успешный ответ — сами данные (без обёртки); ошибка — ApiErrorBody с ru-сообщением.
 */

/** Машинные коды ошибок. Новые коды добавлять сюда (клиент и handlers используют один список). */
export type ApiErrorCode =
  | "badRequest"
  | "validationFailed"
  | "unauthorized"
  | "accountBlocked"
  | "forbidden"
  | "notFound"
  | "conflict"
  | "invalidTransition"
  | "evaluationPending"
  | "internal"
  /** Только клиент: сеть недоступна / ответ не получен. */
  | "networkError"
  /** Только клиент: путь /api/v1/* вне ai/* не обслужен — фронт собран без BACKEND_URL. */
  | "serverRequired";

/** Единый формат ошибки мок-слоя: `{ error: { code, message } }`, message — по-русски. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

/** Единый формат списка с пагинацией (GET /cards и др.). page — с 1. */
export interface PageResponse<TItem> {
  items: TItem[];
  total: number;
  page: number;
  perPage: number;
}

/** Параметры пагинации запроса. */
export interface PageQuery {
  page?: number;
  perPage?: number;
}

/** Скаляр query-параметра. */
export type QueryScalar = string | number | boolean;

/**
 * Значение query-параметра. Массив → повторные ключи (`?okrug=ЮАО&okrug=САО`) — единый формат
 * множественных параметров проекта. undefined/null/"" — параметр не передаётся.
 */
export type QueryValue = QueryScalar | readonly QueryScalar[] | null | undefined;

export type QueryParams = Readonly<Record<string, QueryValue>>;
