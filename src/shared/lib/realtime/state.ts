/*
 * Состояние подписки на поток: курсор окна (since, at], счётчик подряд идущих сбоев и пауза до повтора.
 * Курсор двигается только после успешного ответа — после сбоя окно догоняется целиком, без потери событий.
 */
import type { Connectivity } from "../network";
import { nextRetryDelayMs } from "./transport";
import type { FeedTransport } from "./transport";

export type FeedPage<TEvent> = {
  /** Правая граница окна — курсор следующего запроса. */
  at: string;
  events: TEvent[];
};

export type FeedConnectionState = {
  transport: FeedTransport;
  /** false — показываем баннер «Соединение потеряно»; уже загруженные данные сохраняются. */
  isOnline: boolean;
  /** Метка последнего успешного тика; null — первый ответ ещё не получен. */
  lastSyncAt: string | null;
  /** Сколько попыток подряд завершились сбоем (0 — связь есть). */
  failureCount: number;
};

export type FeedStateDeps = {
  connectivity: Connectivity;
  transport: FeedTransport;
  onStateChange?: (state: FeedConnectionState) => void;
};

export type FeedState = {
  readonly since: string | undefined;
  readonly retryDelayMs: number;
  succeed: (at: string) => void;
  fail: () => void;
  setTransport: (transport: FeedTransport) => void;
  publish: () => void;
};

export function createFeedState({ connectivity, transport, onStateChange }: FeedStateDeps): FeedState {
  let currentTransport = transport;
  let since: string | undefined;
  let lastSyncAt: string | null = null;
  let failureCount = 0;
  let retryDelayMs = 0;

  const publish = () =>
    onStateChange?.({
      transport: currentTransport,
      isOnline: failureCount === 0,
      lastSyncAt,
      failureCount,
    });

  return {
    get since() {
      return since;
    },
    get retryDelayMs() {
      return retryDelayMs;
    },
    succeed: (at: string) => {
      since = at;
      lastSyncAt = at;
      if (failureCount > 0) connectivity.markOnline();
      failureCount = 0;
      retryDelayMs = 0;
    },
    fail: () => {
      failureCount += 1;
      retryDelayMs = nextRetryDelayMs(retryDelayMs);
      connectivity.markOffline();
    },
    setTransport: (next: FeedTransport) => {
      currentTransport = next;
    },
    publish,
  };
}
