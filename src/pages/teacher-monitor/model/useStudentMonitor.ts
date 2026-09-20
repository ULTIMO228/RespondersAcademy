"use client";

import { useEffect, useState } from "react";

import {
  buildAttemptActions,
  buildStudentState,
  reduceLiveStates,
  useLiveSession,
  useMonitorFeed,
  useMonitorDeps,
  useMonitorReference,
  useNow,
  useStudents,
} from "@/widgets/monitor-grid";
import type { SnapshotAction } from "@/widgets/monitor-grid";
import type { CardEventContract } from "@/shared/api";

import { loadMirrorCard } from "../api/loadMirrorCard";
import type { MirrorCard } from "../api/loadMirrorCard";
import type { MonitorAccess, StudentMonitorView } from "./types";
import { resolveAccess } from "../lib/resolveAccess";

/** Карточка зеркала: перезагружается только при смене карточки у курсанта. */
function useMirrorCard(cardId: string | null): MirrorCard | null {
  const { api } = useMonitorDeps();
  const [mirror, setMirror] = useState<MirrorCard | null>(null);
  useEffect(() => {
    if (!cardId) {
      setMirror(null);
      return undefined;
    }
    const controller = new AbortController();
    loadMirrorCard(api, cardId, controller.signal).then(
      (loaded) => {
        if (!controller.signal.aborted) setMirror(loaded);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api, cardId]);
  return mirror;
}

/** Действия курсанта по текущей попытке для сверки с эталоном (T3.3-08). */
function collectActions(attempt: CardEventContract | undefined): SnapshotAction[] {
  return attempt ? buildAttemptActions(attempt) : [];
}

/**
 * Экран курсанта (T3.3-07…T3.3-09): занятие преподавателя + лента этого курсанта. Доступ — только к своему
 * идущему занятию и только к его курсантам; иначе экран отказа. Тик тот же, что у дашборда, поэтому
 * зеркало и лента класса расходятся не больше чем на один тик.
 */
export function useStudentMonitor(teacherId: string, studentId: string): StudentMonitorView {
  const { state, reload } = useLiveSession(teacherId);
  const live = state.status === "ready" ? state.live : null;
  const session = live?.session ?? null;
  const access: MonitorAccess = resolveAccess(state, studentId);
  const feed = useMonitorFeed(access === "granted" && session ? session.id : null, studentId);
  const students = useStudents(session?.studentIds ?? []);
  const reference = useMonitorReference();
  const nowMs = useNow();

  const liveStates = reduceLiveStates(feed.events, [studentId]);
  const studentLive = liveStates[studentId];
  const current = studentLive && live ? buildStudentState(studentLive, nowMs, live.norms) : null;
  const attempt = session?.cardEvents.find((event) => event.id === current?.attempt?.attemptId);
  const mirror = useMirrorCard(current?.cardId ?? null);

  /* Новые события ленты меняют попытку (статусы, вызовы) — перечитываем занятие целиком. */
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (feed.events.length === seen) return;
    const isFirstPage = seen === 0;
    setSeen(feed.events.length);
    if (!isFirstPage) reload();
  }, [feed.events.length, reload, seen]);

  return {
    access,
    state,
    session,
    student: students.find((candidate) => candidate.id === studentId) ?? null,
    current,
    attempt: attempt ?? null,
    actions: collectActions(attempt),
    mirror,
    reference,
    isOnline: feed.isOnline,
    norms: live?.norms ?? null,
  };
}
