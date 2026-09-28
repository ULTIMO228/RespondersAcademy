/*
 * Текущая карточка, состояние и таймеры курсанта (T3.3-04). Таймеры считаются локально от issuedAt/openedAt
 * по «сейчас» клиента — серверных тиков нет (spec/000-фронт/03-architecture.md «Реальное время»), поэтому при обрыве
 * связи они продолжают идти. Нарушение норматива — строго больше (isNormExceeded).
 */
import { isNormExceeded, parseIsoMs } from "@/entities/session";
import type { StudentLiveState, TimeNormsMs } from "@/entities/session";

import { findIssuedAt, findLastCompleted, findOpenAttempt } from "./liveState";
import type { AttemptLive, StudentLive } from "./liveState";

/**
 * Молчание АРМ, после которого плитка считается офлайн: 5 мин без единого события при невыполненной
 * карточке. В моках нет heartbeat АРМ — эвристика заменяет его до появления реального сигнала.
 */
export const OFFLINE_SILENCE_MS = 300_000;

export type StudentStateView = {
  state: StudentLiveState;
  cardId: string | null;
  attempt: AttemptLive | null;
  reactionMs: number;
  processingMs: number;
  isReactionExceeded: boolean;
  isProcessingExceeded: boolean;
  ddsStatus: string | null;
};

type Resolved = {
  state: Exclude<StudentLiveState, "offline">;
  cardId: string | null;
  attempt: AttemptLive | null;
};

/** Что курсант делает сейчас: открытая попытка → отработка; свежее завершение → завершил; иначе ожидание. */
function resolveCurrent(live: StudentLive): Resolved {
  const open = findOpenAttempt(live);
  if (open) return { state: "working", cardId: open.cardId, attempt: open };
  const lastIssued = live.issued.at(-1) ?? null;
  const completed = findLastCompleted(live);
  const isFresh =
    completed && (!lastIssued || parseIsoMs(completed.completedAt ?? "") >= parseIsoMs(lastIssued.issuedAt));
  if (completed && isFresh) return { state: "finished", cardId: completed.cardId, attempt: completed };
  return { state: "waiting", cardId: lastIssued?.cardId ?? null, attempt: null };
}

function reactionMsOf(live: StudentLive, current: Resolved, nowMs: number): number {
  const cardId = current.cardId;
  if (!cardId) return 0;
  const issuedAt = findIssuedAt(live, cardId);
  if (!issuedAt) return 0;
  const openedMs = current.attempt ? parseIsoMs(current.attempt.openedAt) : nowMs;
  return Math.max(0, openedMs - parseIsoMs(issuedAt));
}

function processingMsOf(current: Resolved, nowMs: number): number {
  const { attempt } = current;
  if (!attempt) return 0;
  if (attempt.completedAt) return attempt.fullProcessingMs;
  return Math.max(0, nowMs - parseIsoMs(attempt.openedAt));
}

/** АРМ молчит: событий нет (или давно не было) при невыполненной карточке — плитка «не подключён». */
function isSilent(live: StudentLive, state: StudentLiveState, nowMs: number): boolean {
  if (state === "finished") return false;
  const firstIssued = live.issued[0];
  if (!firstIssued) return false;
  const lastSignalMs = parseIsoMs(live.lastEventAt ?? firstIssued.issuedAt);
  return nowMs - lastSignalMs > OFFLINE_SILENCE_MS;
}

export function buildStudentState(live: StudentLive, nowMs: number, norms: TimeNormsMs): StudentStateView {
  const current = resolveCurrent(live);
  const reactionMs = reactionMsOf(live, current, nowMs);
  const processingMs = processingMsOf(current, nowMs);
  const isOffline = isSilent(live, current.state, nowMs);
  return {
    state: isOffline ? "offline" : current.state,
    cardId: current.cardId,
    attempt: current.attempt,
    reactionMs,
    processingMs,
    isReactionExceeded: isNormExceeded(reactionMs, norms.primaryReactionMs),
    isProcessingExceeded: isNormExceeded(processingMs, norms.fullProcessingMs),
    ddsStatus: current.attempt?.ddsStatus ?? null,
  };
}
