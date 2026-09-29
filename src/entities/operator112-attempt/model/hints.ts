/*
 * Подсказки тренировки (FR-017): таймер простоя считает фронт и шлёт событие hintShown, сервер лишь считает подсказки
 * и в экзамене отвечает 409 (services/operator112_service.py). Шаги приходят в попытке (hints.steps), порядок — по этапам работы.
 */
import type { OperatorAttempt, OperatorHintStep } from "@/shared/api";

const MS_IN_SECOND = 1000;

/** Что уже сделано на экране: определяет, какой шаг подсказать первым из ещё не выполненных. */
export type HintProgress = {
  answered: boolean;
  applicant: boolean;
  address: boolean;
  description: boolean;
  poll: boolean;
  signs: boolean;
  notification: boolean;
};

const STAGE_DONE: Record<string, (progress: HintProgress) => boolean> = {
  answer: (progress) => progress.answered,
  applicant: (progress) => progress.applicant,
  address: (progress) => progress.address,
  description: (progress) => progress.description,
  poll: (progress) => progress.poll,
  signs: (progress) => progress.signs,
  notification: (progress) => progress.notification,
};

/** Первый невыполненный шаг; нет подсказок, все шаги выполнены — «submit» (сохранить карточку). */
export function pickHintStep(
  steps: readonly OperatorHintStep[],
  progress: HintProgress,
): OperatorHintStep | null {
  if (steps.length === 0) return null;
  const pending = steps.find((step) => !(STAGE_DONE[step.stage]?.(progress) ?? step.stage !== "submit"));
  return pending ?? steps.find((step) => step.stage === "submit") ?? null;
}

/** Подсказка полагается, когда подсказки включены, попытка не передана и с последней активности прошло idleSec. */
export function isHintDue(attempt: OperatorAttempt, lastActivityMs: number, nowMs: number): boolean {
  const hints = attempt.hints;
  if (!hints?.enabled || attempt.state === "submitted") return false;
  return nowMs - lastActivityMs >= hints.idleSec * MS_IN_SECOND;
}
