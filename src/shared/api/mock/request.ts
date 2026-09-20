/*
 * Разбор входа route handler'ов: тело JSON, query-параметры, динамические params (Next 16: Promise).
 * Все ошибки — MockApiError 400 с ru-сообщением (перехватывает withErrorHandling).
 */
import { badRequest } from "./respond";

/** Второй аргумент route handler'а динамического роута: `{ params: Promise<{ id: string }> }`. */
export interface RouteContext<TParams extends Record<string, string> = { id: string }> {
  params: Promise<TParams>;
}

const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 10;
const MAX_PER_PAGE = 100;

export function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

/** Тело запроса как JSON-объект; с guard — проверенного типа. */
export async function readJsonBody<TBody = Record<string, unknown>>(
  request: Request,
  guard?: (candidate: unknown) => candidate is TBody,
): Promise<TBody> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    throw badRequest("Некорректное тело запроса: ожидается JSON");
  }
  if (!isRecord(parsed)) throw badRequest("Некорректное тело запроса: ожидается JSON-объект");
  if (guard && !guard(parsed)) throw badRequest("Некорректные поля в теле запроса");
  return parsed as TBody;
}

/** URLSearchParams запроса (кириллица декодируется стандартно). */
export function readSearchParams(request: Request): URLSearchParams {
  return new URL(request.url).searchParams;
}

/** Все непустые значения множественного параметра (формат проекта — повторные ключи: `?a=1&a=2`). */
export function readListParam(params: URLSearchParams, key: string): string[] {
  return params
    .getAll(key)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** Непустое значение одиночного параметра или undefined. */
export function readStringParam(params: URLSearchParams, key: string): string | undefined {
  const raw = params.get(key)?.trim();
  return raw ? raw : undefined;
}

interface IntParamOptions {
  fallback: number;
  min?: number;
  max?: number;
}

/** Целый параметр; мусор (`abc`, `1.5`, вне диапазона) → 400. */
export function readIntParam(params: URLSearchParams, key: string, options: IntParamOptions): number {
  const raw = readStringParam(params, key);
  if (raw === undefined) return options.fallback;
  const parsed = Number(raw);
  const isOutOfRange =
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max);
  if (!Number.isInteger(parsed) || isOutOfRange) {
    throw badRequest(`Некорректное значение параметра «${key}»: ${raw}`);
  }
  return parsed;
}

/** page (с 1) и perPage (по умолчанию 10, максимум 100). */
export function readPageParams(params: URLSearchParams): { page: number; perPage: number } {
  return {
    page: readIntParam(params, "page", { fallback: DEFAULT_PAGE, min: 1 }),
    perPage: readIntParam(params, "perPage", { fallback: DEFAULT_PER_PAGE, min: 1, max: MAX_PER_PAGE }),
  };
}
