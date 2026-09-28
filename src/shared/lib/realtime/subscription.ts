/*
 * Подписка на поток событий занятия (T3.3-02): тик 2–5 сек по окну (since, at], автопереподключение после
 * сбоя сети с экспоненциальной паузой и без потери уже загруженных данных (ТЗ §7 — восстановление ≤ 30 сек).
 * Транспорт: SSE, если задана фабрика потока, иначе long-poll (pickFeedTransport); ошибка SSE → long-poll.
 */
import { systemClock } from "../clock";
import { appConnectivity } from "../network";
import { createPoller } from "./poller";
import { openEventStream } from "./sse";
import { createFeedState } from "./state";
import type { FeedConnectionState, FeedPage } from "./state";
import { FEED_TICK_MS, pickFeedTransport } from "./transport";
import type { RealtimeDeps } from "./transport";

export type FeedSubscriptionOptions<TEvent> = {
  /** Одна выборка окна (since, at]: клиентская функция мок-API (shared/api). */
  fetchPage: (since: string | undefined, signal: AbortSignal) => Promise<FeedPage<TEvent>>;
  onEvents: (page: FeedPage<TEvent>) => void;
  onStateChange?: (state: FeedConnectionState) => void;
  /** Шаг опроса, 2000–5000 мс (spec/000-фронт/03-architecture.md «Реальное время»). */
  tickMs?: number;
  /** Адрес SSE-потока для фабрики (реальный бэкенд); мок-слой соединений не держит. */
  streamUrl?: string;
  deps?: Partial<RealtimeDeps>;
};

/** Снять подписку: таймеры, запрос и поток закрываются (нет утечек при размонтировании). */
export type FeedSubscription = { stop: () => void };

export function createFeedSubscription<TEvent>(options: FeedSubscriptionOptions<TEvent>): FeedSubscription {
  const clock = options.deps?.clock ?? systemClock;
  const connectivity = options.deps?.connectivity ?? appConnectivity;
  const createEventStream = options.deps?.createEventStream ?? null;
  const transport = pickFeedTransport({ createEventStream });
  const state = createFeedState({ connectivity, transport, onStateChange: options.onStateChange });

  const accept = (page: FeedPage<TEvent>) => {
    state.succeed(page.at);
    options.onEvents(page);
    state.publish();
  };
  const poller = createPoller<TEvent>({
    fetchPage: options.fetchPage,
    onPage: options.onEvents,
    state,
    clock,
    tickMs: options.tickMs ?? FEED_TICK_MS,
  });

  let stream: { close: () => void } | null = null;
  /** SSE не открылся или отдал мусор → долив событий через long-poll с того же курсора. */
  const fallbackToPolling = () => {
    stream = null;
    state.setTransport("longPoll");
    state.publish();
    poller.start();
  };

  if (transport === "sse" && createEventStream) {
    stream = openEventStream<TEvent>({
      url: options.streamUrl ?? "",
      createEventStream,
      onPage: accept,
      onFailure: fallbackToPolling,
    });
    state.publish();
  } else {
    poller.start();
  }

  return {
    stop: () => {
      poller.stop();
      stream?.close();
      stream = null;
    },
  };
}
