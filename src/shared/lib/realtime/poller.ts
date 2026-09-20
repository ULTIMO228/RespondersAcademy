/*
 * Long-poll ветка подписки: тик по окну (since, at], пауза до повтора после сбоя, отмена запроса и таймера
 * при остановке (нет утечек и «догоняющих» ответов после размонтирования).
 */
import type { Clock, TimerHandle } from "../clock";
import type { FeedPage, FeedState } from "./state";

export type PollerOptions<TEvent> = {
  fetchPage: (since: string | undefined, signal: AbortSignal) => Promise<FeedPage<TEvent>>;
  onPage: (page: FeedPage<TEvent>) => void;
  state: FeedState;
  clock: Clock;
  tickMs: number;
};

export type Poller = { start: () => void; stop: () => void };

export function createPoller<TEvent>({
  fetchPage,
  onPage,
  state,
  clock,
  tickMs,
}: PollerOptions<TEvent>): Poller {
  let isStopped = false;
  let timer: TimerHandle | null = null;
  let controller: AbortController | null = null;

  const schedule = (delayMs: number) => {
    if (isStopped) return;
    timer = clock.setTimeout(() => void tick(), delayMs);
  };

  async function tick(): Promise<void> {
    if (isStopped) return;
    controller = new AbortController();
    try {
      const page = await fetchPage(state.since, controller.signal);
      if (isStopped) return;
      state.succeed(page.at);
      onPage(page);
      state.publish();
      schedule(tickMs);
    } catch {
      if (isStopped) return;
      state.fail();
      state.publish();
      schedule(state.retryDelayMs);
    }
  }

  return {
    start: () => void tick(),
    stop: () => {
      isStopped = true;
      if (timer !== null) clock.clearTimeout(timer);
      controller?.abort();
      timer = null;
      controller = null;
    },
  };
}
