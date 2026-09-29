/*
 * Нормативы и лимиты попытки режима 112. Источник — параметры задания (AssignmentParams): бэкенд не кладёт нормативы в попытку
 * (services/operator112_service.py: answer_norm_sec), поэтому страница читает их из GET /assignments/{id}.
 * Значения по умолчанию — норматив заказчика (Q&A в6): реакция 30 сек, полная отработка 3 мин.
 */
import type { AssignmentParams } from "@/shared/api";

export const DEFAULT_ANSWER_SEC = 30;
export const DEFAULT_SUBMIT_SEC = 180;

export type AttemptNorms = {
  /** Ожидание ответа на вызов, сек (от поступления вызова). */
  answerSec: number;
  /** Полная отработка карточки, сек (от поступления вызова). */
  submitSec: number;
};

function positiveOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveNorms(params?: AssignmentParams | null): AttemptNorms {
  return {
    answerSec: positiveOr(params?.norms?.answerSec, DEFAULT_ANSWER_SEC),
    submitSec: positiveOr(params?.norms?.submitSec, DEFAULT_SUBMIT_SEC),
  };
}

/** Лимит времени экзамена на одну попытку, сек; нет лимита — null. */
export function resolveTimeLimitSec(params?: AssignmentParams | null): number | null {
  const limit = params?.timeLimitSec;
  return typeof limit === "number" && Number.isFinite(limit) && limit > 0 ? limit : null;
}
