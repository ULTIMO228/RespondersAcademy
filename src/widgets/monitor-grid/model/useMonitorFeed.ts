"use client";

import { useEffect, useEffectEvent, useState } from "react";

import { createFeedSubscription } from "@/shared/lib";
import type { FeedConnectionState } from "@/shared/lib";
import type { SessionFeedEvent } from "@/shared/api";

import { useMonitorDeps } from "./deps";

export type MonitorFeed = {
  /** Все события занятия с начала подписки, в порядке ленты. */
  events: SessionFeedEvent[];
  connection: FeedConnectionState | null;
  /** Связь потеряна — показываем баннер, данные и таймеры сохраняются. */
  isOnline: boolean;
};

const INITIAL: SessionFeedEvent[] = [];

/**
 * Подписка дашборда и монитора на ленту занятия (T3.3-02): окно (since, at] каждые 2–5 сек,
 * автопереподключение после сбоя без потери уже полученных событий. studentId сужает ленту до одного
 * курсанта (экран монитора). Подписка снимается при размонтировании и при смене занятия.
 */
export function useMonitorFeed(sessionId: string | null, studentId?: string): MonitorFeed {
  const { api, clock, realtime, tickMs } = useMonitorDeps();
  const [events, setEvents] = useState<SessionFeedEvent[]>(INITIAL);
  const [connection, setConnection] = useState<FeedConnectionState | null>(null);

  const append = useEffectEvent((fresh: SessionFeedEvent[]) => {
    if (fresh.length > 0) setEvents((current) => [...current, ...fresh]);
  });

  useEffect(() => {
    if (!sessionId) return undefined;
    setEvents(INITIAL);
    const subscription = createFeedSubscription<SessionFeedEvent>({
      fetchPage: async (since, signal) => {
        const response = await api.getSessionFeed(sessionId, { since, studentId }, signal);
        return { at: response.at, events: response.events };
      },
      onEvents: (page) => append(page.events),
      onStateChange: setConnection,
      tickMs,
      deps: { clock, ...realtime },
    });
    return () => subscription.stop();
  }, [api, clock, realtime, sessionId, studentId, tickMs]);

  return { events, connection, isOnline: connection?.isOnline ?? true };
}
