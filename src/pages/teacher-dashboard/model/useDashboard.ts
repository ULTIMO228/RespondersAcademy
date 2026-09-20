"use client";

import { useEffect, useState } from "react";

import {
  buildFeedItems,
  buildQueueItems,
  buildStudentTiles,
  reduceLiveStates,
  useCardCaptions,
  useLiveSession,
  useMonitorFeed,
  useMonitorReference,
  useNow,
  useStudents,
} from "@/widgets/monitor-grid";
import type { MonitorSource } from "@/widgets/monitor-grid";

import { buildHeader } from "../lib/buildHeader";
import type { DashboardView } from "./types";

/** Новые события ленты меняют расписание выдачи (внеочередная карточка) — занятие перечитывается. */
function useReloadOnEvents(eventCount: number, reload: () => void): void {
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (eventCount === seen) return;
    const isFirstPage = seen === 0;
    setSeen(eventCount);
    if (!isFirstPage) reload();
  }, [eventCount, reload, seen]);
}

/**
 * Данные дашборда класса (T3.3-03…T3.3-06). Единственный источник состояния курсантов — лента занятия;
 * таймеры и время от старта считаются локально по «сейчас», поэтому при потере связи продолжают идти.
 */
export function useDashboard(teacherId: string, teacherName: string): DashboardView {
  const { state, reload } = useLiveSession(teacherId);
  const live = state.status === "ready" ? state.live : null;
  const session = live?.session ?? null;
  const feed = useMonitorFeed(session?.id ?? null);
  const students = useStudents(session?.studentIds ?? []);
  const reference = useMonitorReference();
  const plannedIds = session?.cardFlow.map((item) => item.cardId) ?? [];
  const captions = useCardCaptions([...plannedIds, ...feed.events.map((event) => event.cardId)]);
  const nowMs = useNow();
  useReloadOnEvents(feed.events.length, reload);

  if (!session || !live) return { state, reload, board: null };

  const source: MonitorSource = {
    session,
    students,
    captions,
    ddsStatuses: reference.ddsStatuses,
    live: reduceLiveStates(feed.events, session.studentIds),
    nowMs,
    norms: live.norms,
  };
  return {
    state,
    reload,
    board: {
      session,
      header: buildHeader(session, teacherName, nowMs),
      tiles: buildStudentTiles(source),
      students,
      queueItems: buildQueueItems(source),
      feedItems: buildFeedItems({
        ...source,
        events: feed.events,
        issuedAt: (studentId, cardId) =>
          source.live[studentId]?.issued.findLast((item) => item.cardId === cardId)?.issuedAt,
      }),
      isOnline: feed.isOnline,
      isIssuePaused: live.isIssuePaused,
    },
  };
}
