/*
 * Лента событий занятия из cardFlow / cardEvents / Evaluation (T1.2-05, T3.3-01) для
 * GET /api/mock/sessions/[id]/feed.
 * Окно (since, at]: since не включается (уже виденные события), at — включается. Реальное время эмулируется
 * клиентскими тиками по startedAt, поэтому функция чистая и не мутирует занятие.
 * Порядок: по времени, при равных метках — детерминированный tie-break (вид события, курсант, карточка,
 * попытка, порядковый номер статуса в попытке).
 */
import type {
  CardEventContract,
  SessionContract,
  SessionFeedEvent,
  SessionFeedEventKind,
} from "@/shared/api";

import { parseIsoMs } from "./timings";

export type SessionFeedWindow = {
  /** Нижняя граница (исключительно); не задана — с начала занятия. */
  since?: string | null;
  /** Верхняя граница (включительно) — «сейчас» сервера. */
  at: string;
};

/** Жизненный порядок видов событий при равной метке: выдача → открытие → статус → завершение → оценка ИИ. */
const KIND_ORDER: Record<SessionFeedEventKind, number> = {
  cardIssued: 0,
  cardOpened: 1,
  statusChanged: 2,
  cardCompleted: 3,
  aiEvaluation: 4,
};

type RankedEvent = { event: SessionFeedEvent; timeMs: number; seq: number };

type AttemptBase = { studentId: string; cardId: string; attemptId: string };

/**
 * Мок-оценка ИИ-модуля (T3.3-01): появляется в ленте в момент завершения попытки, помечена isAi —
 * UI обязан показать бейдж «ИИ» (spec/000-фронт/07-design-guidelines.md, Q&A в3). Без оценки события нет.
 */
function evaluationEvents(attempt: CardEventContract, base: AttemptBase): SessionFeedEvent[] {
  const { evaluation, completedAt } = attempt;
  if (!evaluation || !completedAt) return [];
  return [
    {
      ...base,
      kind: "aiEvaluation",
      at: completedAt,
      isAi: true,
      totalScore: evaluation.totalScore,
      errorCount: evaluation.errors.length + evaluation.grammarErrors.length,
      aiComment: evaluation.aiComment,
    },
  ];
}

function attemptEvents(attempt: CardEventContract): SessionFeedEvent[] {
  const base: AttemptBase = { studentId: attempt.studentId, cardId: attempt.cardId, attemptId: attempt.id };
  const completed: SessionFeedEvent[] = attempt.completedAt
    ? [
        {
          ...base,
          kind: "cardCompleted",
          at: attempt.completedAt,
          fullProcessingMs: attempt.fullProcessingMs,
        },
      ]
    : [];
  return [
    { ...base, kind: "cardOpened", at: attempt.openedAt },
    ...attempt.statuses.map((mark): SessionFeedEvent => ({
      ...base,
      kind: "statusChanged",
      at: mark.at,
      mark: { ...mark },
    })),
    /* Незавершённая попытка (T2.3-01: открыта, completedAt = "") — без события завершения. */
    ...completed,
    ...evaluationEvents(attempt, base),
  ];
}

function collectRanked(session: SessionContract): RankedEvent[] {
  const issued = session.cardFlow.map((item): SessionFeedEvent => ({
    kind: "cardIssued",
    at: item.issuedAt,
    studentId: item.studentId,
    cardId: item.cardId,
    level: item.level,
  }));
  const all = [...issued, ...session.cardEvents.flatMap(attemptEvents)];
  return all.map((event, seq) => ({ event, timeMs: parseIsoMs(event.at), seq }));
}

function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function compareRanked(left: RankedEvent, right: RankedEvent): number {
  const a = left.event;
  const b = right.event;
  return (
    left.timeMs - right.timeMs ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    compareText(a.studentId, b.studentId) ||
    compareText(a.cardId, b.cardId) ||
    compareText("attemptId" in a ? a.attemptId : "", "attemptId" in b ? b.attemptId : "") ||
    left.seq - right.seq
  );
}

export function buildSessionFeed(session: SessionContract, window: SessionFeedWindow): SessionFeedEvent[] {
  const atMs = parseIsoMs(window.at);
  const sinceMs = window.since ? parseIsoMs(window.since) : Number.NEGATIVE_INFINITY;
  return collectRanked(session)
    .filter(({ timeMs }) => timeMs > sinceMs && timeMs <= atMs)
    .sort(compareRanked)
    .map(({ event }) => event);
}
