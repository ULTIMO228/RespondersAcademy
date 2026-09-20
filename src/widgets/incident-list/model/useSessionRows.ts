"use client";

import { useEffect, useEffectEvent, useMemo } from "react";

import type { IncidentListItem, IncidentMapContext } from "@/entities/incident";
import { DEFAULT_PRIMARY_REACTION_MS, PROFILE_CATEGORIES } from "@/entities/session";
import type { PublicUser } from "@/shared/api";
import { formatDuration } from "@/shared/lib";

import { resolveProfileGroups } from "../lib/profileFilter";
import { buildSessionRows } from "../lib/sessionRows";
import { useActiveSession } from "./useActiveSession";
import { reactionKey, useReactions } from "./useReactions";
import { useSessionFeed } from "./useSessionFeed";
import type { ActiveSession, JournalSession } from "./types";

type SessionRowsOptions = {
  student: PublicUser;
  context: IncidentMapContext | null;
  nowMs: number;
  isAutoUpdate: boolean;
};

type Reactions = ReturnType<typeof useReactions>;

/** Истечение 30 сек без открытия — нарушение фиксируется один раз (при появлении, а не каждый тик). */
function useViolationRecorder(rows: IncidentListItem[], sessionId: string | null, reactions: Reactions) {
  const expired = rows
    .filter((row) => row.state === "violation")
    .map((row) => row.id)
    .join(",");
  const recordViolations = useEffectEvent(() => {
    if (!sessionId) return;
    rows.forEach((row) => {
      if (row.state === "violation" && row.issuedAt) {
        reactions.recordExpired({ sessionId, cardId: row.id, issuedAt: row.issuedAt });
      }
    });
  });
  useEffect(() => {
    if (expired) recordViolations();
  }, [expired]);
}

function toBadge(active: ActiveSession | null, nowMs: number): JournalSession | null {
  if (!active) return null;
  return { title: active.title, remaining: formatDuration(Date.parse(active.endsAt) - nowMs) };
}

/** Активное занятие + лента его карточек с профильным фильтром службы курсанта (T2.2-14, T2.2-15). */
function useProfiledSession(student: PublicUser, isAutoUpdate: boolean) {
  const profileGroups = useMemo(
    () => resolveProfileGroups(student.service, PROFILE_CATEGORIES),
    [student.service],
  );
  const session = useActiveSession(student, profileGroups);
  const sessionId = session.active?.sessionId ?? null;
  const feedOptions = { sessionId, studentId: student.id, profileGroups, isAutoUpdate };
  const issued = useSessionFeed({ ...feedOptions, onSessionLost: session.clear });
  return { session, sessionId, issued };
}

/**
 * Режим занятия на /arm: активное занятие по модулю, строки поступивших карточек с живыми таймерами 30 сек,
 * фиксация открытия/нарушения, бейдж занятия (название + оставшееся время) и счётчик неоткрытых карточек.
 */
export function useSessionRows({ student, context, nowMs, isAutoUpdate }: SessionRowsOptions) {
  const { session, sessionId, issued } = useProfiledSession(student, isAutoUpdate);
  const reactions = useReactions(DEFAULT_PRIMARY_REACTION_MS);
  const armNumber = String(student.armNumber);
  const rows = useMemo(() => {
    if (!context || !sessionId) return [];
    const findRecord = (cardId: string) => reactions.records[reactionKey(sessionId, cardId)];
    return buildSessionRows({
      issued,
      context,
      armNumber,
      nowMs,
      normMs: DEFAULT_PRIMARY_REACTION_MS,
      findRecord,
    });
  }, [context, sessionId, issued, armNumber, reactions.records, nowMs]);
  useViolationRecorder(rows, sessionId, reactions);

  function recordOpen(cardId: string) {
    const row = rows.find((candidate) => candidate.id === cardId);
    if (sessionId && row?.issuedAt) reactions.recordOpen({ sessionId, cardId, issuedAt: row.issuedAt });
  }

  return {
    rows,
    badge: toBadge(session.active, nowMs),
    newCount: rows.filter((row) => row.state !== "normal").length,
    activeScenarioId: session.active?.scenarioId ?? null,
    startState: session.startState,
    startModule: session.start,
    recordOpen,
  };
}
