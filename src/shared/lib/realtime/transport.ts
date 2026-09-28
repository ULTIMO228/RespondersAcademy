/*
 * Транспорт подписки на поток событий (spec/000-фронт/03-architecture.md «Реальное время»): SSE, если он доступен,
 * иначе long-poll с шагом 2–5 сек. Зависимости (EventSource, часы, состояние связи) — за интерфейсами
 * (spec/000-фронт/10-code-rules.md §6), поэтому в тестах подменяются без сети и без браузера.
 */
import type { Clock } from "../clock";
import type { Connectivity } from "../network";

/** Шаг опроса ленты по умолчанию — середина допустимого окна 2–5 сек. */
export const FEED_TICK_MS = 3000;
/** Первая пауза перед повтором после сбоя; далее удваивается до FEED_MAX_RETRY_MS. */
export const FEED_RETRY_MS = 2000;
/** Потолок паузы: ТЗ §7 — восстановление без потери данных не дольше 30 сек. */
export const FEED_MAX_RETRY_MS = 8000;

export type FeedTransport = "sse" | "longPoll";

/** Минимум, который нужен подписке от EventSource (подменяется в тестах). */
export interface EventStream {
  addEventListener(type: "message" | "error", listener: (event: { data?: string }) => void): void;
  close(): void;
}

export type EventStreamFactory = (url: string) => EventStream;

export type RealtimeDeps = {
  clock: Clock;
  connectivity: Connectivity;
  /** Фабрика SSE-потока; не передана или вернула null → работает long-poll. */
  createEventStream?: EventStreamFactory | null;
};

/**
 * Выбор транспорта: SSE только если фабрика задана. Мок-слой соединений не держит
 * (docs/mock-api.md, `GET /sessions/[id]/feed`), поэтому по умолчанию — long-poll; фабрика остаётся
 * точкой подключения реального бэкенда.
 */
export function pickFeedTransport(deps: Pick<RealtimeDeps, "createEventStream">): FeedTransport {
  return deps.createEventStream ? "sse" : "longPoll";
}

/** Пауза перед повтором: экспоненциальная, с потолком (без «шторма» запросов при долгом сбое). */
export function nextRetryDelayMs(previousDelayMs: number): number {
  if (previousDelayMs <= 0) return FEED_RETRY_MS;
  return Math.min(previousDelayMs * 2, FEED_MAX_RETRY_MS);
}
