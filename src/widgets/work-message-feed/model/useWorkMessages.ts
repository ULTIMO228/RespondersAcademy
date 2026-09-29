"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError, listWorkMessages } from "@/shared/api";
import type { WorkMessage } from "@/shared/api";
import { createFeedSubscription } from "@/shared/lib";
import type { FeedConnectionState, FeedPage, RealtimeDeps } from "@/shared/lib";

/** Курсор до первого сообщения: «с начала времён» в ISO 8601 (сервер проверяет формат since). */
export const WORK_FEED_EPOCH = "1970-01-01T00:00:00+00:00";

export type FetchWorkMessages = (
  attemptId: string,
  since: string | undefined,
  signal: AbortSignal,
) => Promise<WorkMessage[]>;

const defaultFetch: FetchWorkMessages = (attemptId, since, signal) =>
  listWorkMessages(attemptId, since, signal);

type Options = {
  attemptId: string;
  /** false — лента не опрашивается (занятие не включало сообщения или карточка ещё не принята). */
  enabled?: boolean;
  fetchMessages?: FetchWorkMessages;
  deps?: Partial<RealtimeDeps>;
};

/**
 * Лента сообщений служб на готовом createFeedSubscription: курсор — at последнего сообщения (серверная метка, а не клиентские
 * часы), дубли по id отбрасываются, опрос останавливается при закрытии карточки и на скрытой вкладке.
 */
export function useWorkMessages({ attemptId, enabled = true, fetchMessages, deps }: Options) {
  const [messages, setMessages] = useState<WorkMessage[]>([]);
  const [connection, setConnection] = useState<FeedConnectionState | null>(null);
  const [isVisible, setVisible] = useState(true);
  const fetchRef = useRef(fetchMessages ?? defaultFetch);
  fetchRef.current = fetchMessages ?? defaultFetch;
  // 404 (нет бэкенда в автономном режиме либо попытка не режима ДДС) — терминален: опрос молча прекращается, без повторов.
  const absent = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState !== "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!enabled || !isVisible) return undefined;
    absent.current = false;
    const subscription = createFeedSubscription<WorkMessage>({
      fetchPage: async (since, signal): Promise<FeedPage<WorkMessage>> => {
        if (absent.current) return { at: since ?? WORK_FEED_EPOCH, events: [] };
        let events: WorkMessage[];
        try {
          events = await fetchRef.current(attemptId, since, signal);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
          absent.current = true;
          events = [];
        }
        return { at: events.at(-1)?.at ?? since ?? WORK_FEED_EPOCH, events };
      },
      onEvents: (page) => {
        if (page.events.length === 0) return;
        setMessages((current) => {
          const known = new Set(current.map((item) => item.id));
          const fresh = page.events.filter((item) => !known.has(item.id));
          return fresh.length ? [...current, ...fresh] : current;
        });
      },
      onStateChange: setConnection,
      deps: depsRef.current,
    });
    return () => subscription.stop();
  }, [attemptId, enabled, isVisible]);

  return { messages, isOnline: connection?.isOnline ?? true };
}
