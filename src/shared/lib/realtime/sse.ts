/*
 * SSE-ветка подписки: поток событий сервера, если бэкенд его держит. Мок-слой соединений не держит
 * (docs/mock-api.md), поэтому фабрика по умолчанию не задана и подписка сразу работает long-poll.
 * Любая ошибка потока (нет поддержки, разрыв, мусорный кадр) → onFailure: вызывающий уходит на long-poll.
 */
import type { EventStreamFactory } from "./transport";
import type { FeedPage } from "./state";

export type EventStreamOptions<TEvent> = {
  url: string;
  createEventStream: EventStreamFactory;
  onPage: (page: FeedPage<TEvent>) => void;
  onFailure: () => void;
};

function parsePage<TEvent>(data: string | undefined): FeedPage<TEvent> | null {
  if (!data) return null;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== "object" || parsed === null) return null;
    const page = parsed as Partial<FeedPage<TEvent>>;
    if (typeof page.at !== "string" || !Array.isArray(page.events)) return null;
    return { at: page.at, events: page.events };
  } catch {
    return null;
  }
}

/** Открывает поток; вернувшийся объект нужно закрыть при размонтировании (нет утечки подписки). */
export function openEventStream<TEvent>({
  url,
  createEventStream,
  onPage,
  onFailure,
}: EventStreamOptions<TEvent>): { close: () => void } {
  let stream: { close: () => void } | null = null;
  const closeAndFallback = () => {
    stream?.close();
    stream = null;
    onFailure();
  };
  try {
    const opened = createEventStream(url);
    stream = opened;
    opened.addEventListener("message", (event) => {
      const page = parsePage<TEvent>(event.data);
      if (page) onPage(page);
      else closeAndFallback();
    });
    opened.addEventListener("error", closeAndFallback);
  } catch {
    /* EventSource недоступен в окружении — сразу long-poll. */
    onFailure();
  }
  return { close: () => stream?.close() };
}
