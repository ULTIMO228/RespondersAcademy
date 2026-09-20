/*
 * Состояние курсанта «на текущий момент» из ленты занятия (T3.3-04). Единственный источник истины —
 * события feed: cardIssued (выдача), cardOpened/statusChanged/cardCompleted (ход попытки),
 * aiEvaluation (мок-оценка ИИ: балл и число ошибок). Функция чистая: тики таймеров считает UI по «сейчас».
 */
import { parseIsoMs } from "@/entities/session";
import type { SessionFeedEvent } from "@/shared/api";

export type IssuedCard = { cardId: string; issuedAt: string; level: number };

export type AttemptLive = {
  attemptId: string;
  cardId: string;
  openedAt: string;
  completedAt: string | null;
  fullProcessingMs: number;
  ddsStatus: string | null;
  /** Ошибки мок-оценки ИИ по этой попытке (errors + grammarErrors). */
  errorCount: number;
  totalScore: number | null;
};

export type StudentLive = {
  studentId: string;
  issued: IssuedCard[];
  attempts: AttemptLive[];
  /** Метка последнего события курсанта — по ней определяется молчание АРМ. */
  lastEventAt: string | null;
};

function emptyLive(studentId: string): StudentLive {
  return { studentId, issued: [], attempts: [], lastEventAt: null };
}

function findAttempt(live: StudentLive, attemptId: string): AttemptLive | undefined {
  return live.attempts.find((attempt) => attempt.attemptId === attemptId);
}

function applyEvent(live: StudentLive, event: SessionFeedEvent): void {
  if (event.kind === "cardIssued") {
    live.issued.push({ cardId: event.cardId, issuedAt: event.at, level: event.level });
    return;
  }
  if (event.kind === "cardOpened") {
    if (findAttempt(live, event.attemptId)) return;
    live.attempts.push({
      attemptId: event.attemptId,
      cardId: event.cardId,
      openedAt: event.at,
      completedAt: null,
      fullProcessingMs: 0,
      ddsStatus: null,
      errorCount: 0,
      totalScore: null,
    });
    return;
  }
  const attempt = findAttempt(live, event.attemptId);
  if (!attempt) return;
  if (event.kind === "statusChanged") attempt.ddsStatus = event.mark.ddsStatus;
  if (event.kind === "cardCompleted") {
    attempt.completedAt = event.at;
    attempt.fullProcessingMs = event.fullProcessingMs;
  }
  if (event.kind === "aiEvaluation") {
    attempt.errorCount = event.errorCount;
    attempt.totalScore = event.totalScore;
  }
}

/**
 * Свёртка ленты по курсантам. События приходят порциями окон (since, at] и уже отсортированы по времени,
 * поэтому свёртка инкрементальна: повторный вызов с накопленным списком даёт тот же результат.
 */
export function reduceLiveStates(
  events: SessionFeedEvent[],
  studentIds: readonly string[],
): Record<string, StudentLive> {
  const states: Record<string, StudentLive> = Object.fromEntries(
    studentIds.map((studentId) => [studentId, emptyLive(studentId)]),
  );
  for (const event of events) {
    const live = (states[event.studentId] ??= emptyLive(event.studentId));
    applyEvent(live, event);
    if (!live.lastEventAt || parseIsoMs(event.at) > parseIsoMs(live.lastEventAt)) live.lastEventAt = event.at;
  }
  return states;
}

/** Открытая попытка курсанта (карточка в работе) — последняя без completedAt. */
export function findOpenAttempt(live: StudentLive): AttemptLive | undefined {
  return live.attempts.filter((attempt) => !attempt.completedAt).at(-1);
}

/** Последняя завершённая попытка. */
export function findLastCompleted(live: StudentLive): AttemptLive | undefined {
  return live.attempts.filter((attempt) => attempt.completedAt).at(-1);
}

/** Момент выдачи карточки курсанту (для норматива первичной реакции). */
export function findIssuedAt(live: StudentLive, cardId: string): string | null {
  return live.issued.findLast((item) => item.cardId === cardId)?.issuedAt ?? null;
}

/** Суммарные ошибки по мок-оценкам ИИ всех попыток курсанта. */
export function sumErrors(live: StudentLive): { errorCount: number; isAiEvaluated: boolean } {
  const evaluated = live.attempts.filter((attempt) => attempt.totalScore !== null);
  return {
    errorCount: evaluated.reduce((sum, attempt) => sum + attempt.errorCount, 0),
    isAiEvaluated: evaluated.length > 0,
  };
}
