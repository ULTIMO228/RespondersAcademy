/*
 * Таймеры попытки режима 112. Единицы — секунды, «сейчас» приходит аргументом (nowMs): расчёты чистые, часы подменяются в тестах.
 * Истина по времени — серверные метки openedAt/answeredAt/completedAt; клиентские часы служат только индикатором (R4).
 */
import type { OperatorAttempt } from "@/shared/api";

const MS_IN_SECOND = 1000;

function toMs(iso: string | undefined): number | null {
  if (!iso) return null;
  const value = Date.parse(iso);
  return Number.isNaN(value) ? null : value;
}

function secBetween(fromMs: number, toMsValue: number): number {
  return Math.max(0, Math.floor((toMsValue - fromMs) / MS_IN_SECOND));
}

export type NormState = {
  elapsedSec: number;
  normSec: number;
  /** Остаток до норматива; после превышения — 0. */
  remainingSec: number;
  exceeded: boolean;
};

function normState(elapsedSec: number, normSec: number): NormState {
  return {
    elapsedSec,
    normSec,
    remainingSec: Math.max(0, normSec - elapsedSec),
    exceeded: elapsedSec > normSec,
  };
}

/** Ожидание ответа: идёт от поступления вызова; после «Ответить» значение замирает на серверном answeredAt. */
export function answerWait(attempt: OperatorAttempt, normSec: number, nowMs: number): NormState {
  const openedMs = toMs(attempt.openedAt) ?? nowMs;
  const stopMs = toMs(attempt.answeredAt) ?? nowMs;
  return normState(secBetween(openedMs, stopMs), normSec);
}

/** Длительность разговора: от ответа до передачи карточки (или до «сейчас»); до ответа — 0. */
export function talkSeconds(attempt: OperatorAttempt, nowMs: number): number {
  const answeredMs = toMs(attempt.answeredAt);
  if (answeredMs === null) return 0;
  return secBetween(answeredMs, toMs(attempt.completedAt) ?? nowMs);
}

/** Полная отработка: от поступления вызова до передачи карточки (или до «сейчас»). */
export function processingWait(attempt: OperatorAttempt, normSec: number, nowMs: number): NormState {
  const openedMs = toMs(attempt.openedAt) ?? nowMs;
  return normState(secBetween(openedMs, toMs(attempt.completedAt) ?? nowMs), normSec);
}

/**
 * Остаток лимита экзамена на попытку: openedAt + timeLimitSec − now. Нет лимита или карточка уже передана — null.
 * По нулю клиент запрашивает GET /assignments/{id}: только он применяет истечение на сервере.
 */
export function examRemainingSec(
  attempt: OperatorAttempt,
  timeLimitSec: number | null,
  nowMs: number,
): number | null {
  if (timeLimitSec === null || attempt.state === "submitted") return null;
  const openedMs = toMs(attempt.openedAt);
  if (openedMs === null) return null;
  return Math.max(0, timeLimitSec - secBetween(openedMs, nowMs));
}

/** «М:СС» для таймеров; отрицательные значения не показываются. */
export function formatClock(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
