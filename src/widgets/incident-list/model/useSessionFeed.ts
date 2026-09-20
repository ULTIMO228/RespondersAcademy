"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";

import { ApiError } from "@/shared/api";
import type { SessionFeedEvent } from "@/shared/api";

import type { IssuedCard } from "../lib/feedRows";
import { mergeIssued } from "../lib/feedRows";
import type { ProfileGroups } from "../lib/profileFilter";
import { filterByProfile } from "../lib/profileFilter";
import type { JournalApi } from "./deps";
import { useJournalDeps } from "./deps";

/** Поллинг ленты занятия GET /sessions/[id]/feed (2–5 сек, spec/03-architecture.md «Реальное время»). */
export const FEED_POLL_MS = 3000;
const NOT_FOUND_STATUS = 404;

type FeedOptions = {
  sessionId: string | null;
  studentId: string;
  profileGroups: ProfileGroups;
  isAutoUpdate: boolean;
  /** Занятие не найдено мок-слоем (перезапуск сервера) — активное занятие сбрасывается. */
  onSessionLost: () => void;
};

type IssuedEvent = Extract<SessionFeedEvent, { kind: "cardIssued" }>;

type FeedCursor = { since?: string; known: Set<string>; busy: boolean };

type PollContext = {
  api: JournalApi;
  studentId: string;
  profileGroups: ProfileGroups;
  cursor: FeedCursor;
  onFresh: (fresh: IssuedCard[]) => void;
  onLost: () => void;
};

function pickMyIssued(events: SessionFeedEvent[], studentId: string, known: Set<string>): IssuedEvent[] {
  return events.filter(
    (event): event is IssuedEvent =>
      event.kind === "cardIssued" && event.studentId === studentId && !known.has(event.cardId),
  );
}

async function loadIssued(api: JournalApi, events: IssuedEvent[]): Promise<IssuedCard[]> {
  const details = await Promise.all(events.map((event) => api.getCard(event.cardId)));
  return details.flatMap((detail, index) =>
    detail.kind === "training" ? [{ card: detail.card, issuedAt: events[index].at }] : [],
  );
}

/** Один тик ленты: окно (since, at] → свои cardIssued → карточки → профильный фильтр; отменённый тик не пишет. */
async function pollFeed(
  sessionId: string,
  context: PollContext & { isCancelled: () => boolean },
): Promise<void> {
  const { api, cursor } = context;
  if (cursor.busy) return;
  cursor.busy = true;
  try {
    const response = await api.getSessionFeed(sessionId, cursor.since ? { since: cursor.since } : undefined);
    const events = pickMyIssued(response.events, context.studentId, cursor.known);
    const issued = await loadIssued(api, events);
    if (context.isCancelled()) return;
    events.forEach((event) => cursor.known.add(event.cardId));
    cursor.since = response.at;
    const fresh = filterByProfile(issued, (item) => item.card.group, context.profileGroups);
    if (fresh.length > 0) context.onFresh(fresh);
  } catch (error) {
    if (error instanceof ApiError && error.status === NOT_FOUND_STATUS) context.onLost();
  } finally {
    cursor.busy = false;
  }
}

/** Сброс ленты при смене занятия: новые окно (since) и множество известных карточек. */
function useFeedCursor(sessionId: string | null, onReset: () => void) {
  const cursor = useRef<FeedCursor>({ known: new Set(), busy: false });
  const reset = useEffectEvent(onReset);
  useEffect(() => {
    cursor.current = { known: new Set(), busy: false };
    reset();
  }, [sessionId]);
  return cursor;
}

/**
 * Новые карточки занятия курсанта (T2.2-07, T2.2-14): cardIssued своего studentId → карточка (GET /cards/c-NNN)
 * → профильный фильтр → строка сверху + звуковой сигнал. Повторный тик не дублирует строки (окно since).
 * Поллинг останавливается при unmount и при выключенном «Автообновлении».
 */
export function useSessionFeed({
  sessionId,
  studentId,
  profileGroups,
  isAutoUpdate,
  onSessionLost,
}: FeedOptions) {
  const { api, sound } = useJournalDeps();
  const [issued, setIssued] = useState<IssuedCard[]>([]);
  const cursor = useFeedCursor(sessionId, () => setIssued([]));
  const onLost = useEffectEvent(() => onSessionLost());
  const onFresh = useEffectEvent((fresh: IssuedCard[]) => {
    setIssued((current) => mergeIssued(current, fresh));
    sound.play();
  });

  useEffect(() => {
    if (!sessionId || !isAutoUpdate) return undefined;
    let isCancelled = false;
    const isCancelledNow = () => isCancelled;
    const context: PollContext = { api, studentId, profileGroups, cursor: cursor.current, onFresh, onLost };
    const poll = () => void pollFeed(sessionId, { ...context, isCancelled: isCancelledNow });
    poll();
    const handle = setInterval(poll, FEED_POLL_MS);
    return () => {
      isCancelled = true;
      clearInterval(handle);
    };
  }, [api, cursor, sessionId, studentId, profileGroups, isAutoUpdate]);

  return issued;
}
