/*
 * Фаза экрана режима 112 и правила доступности действий. Состояния сервера — ringing → answered → submitted (односторонние);
 * «starting» и «submitting» — только клиентские (идёт запрос, не более одного submit одновременно).
 */
import type { AssignmentFormat, OperatorAttempt } from "@/shared/api";

export type AttemptPhase = "starting" | "ringing" | "answered" | "submitting" | "submitted";

export function attemptPhase(attempt: OperatorAttempt | null, submitting = false): AttemptPhase {
  if (!attempt) return "starting";
  if (attempt.state === "submitted") return "submitted";
  if (submitting) return "submitting";
  return attempt.state;
}

export const canAnswer = (attempt: OperatorAttempt): boolean => attempt.state === "ringing";
export const canEdit = (attempt: OperatorAttempt): boolean => attempt.state === "answered";
export const canSubmit = (attempt: OperatorAttempt, submitting = false): boolean =>
  attempt.state === "answered" && !submitting;

/** В экзамене запись прослушивается один раз: второй запрос файла сервер отклоняет (409). */
export function isReplayBlocked(attempt: OperatorAttempt, format: AssignmentFormat | null): boolean {
  return format === "exam" && attempt.replays >= 1;
}

/** Сервер отметил превышение норматива ответа событием answerTimeout. */
export const hasAnswerTimeout = (attempt: OperatorAttempt): boolean =>
  attempt.events.some((event) => event.type === "answerTimeout");

/** Аварийный текстовый режим: записи нет (не готова, сбой синтеза) — работать по расшифровке. */
export function isEmergencyAudio(attempt: OperatorAttempt): boolean {
  const audio = attempt.audio;
  return !audio || audio.emergency || audio.status !== "ready";
}
