/*
 * Таймер карточки режима 112 (спека 009, FR-013, research R7 / R7a): «ММ:СС» от «Принять» до «сохранить».
 * Расчёт поверх talkSeconds и formatClock; «сейчас» приходит аргументом (nowMs), часы подменяются в тестах.
 */
import type { OperatorAttempt } from "@/shared/api";

import { formatClock, talkSeconds } from "./timers";

/**
 * Порога нет в памятке и сверке; на референсах тёмный на 00:09 (КАРТОЧКА_1), красный на 01:23 (КАРТОЧКА_2) → 60 с
 * (spec 009 FR-013, research R7a). Меняется одной строкой, если заказчик назовёт точное значение.
 */
export const CARD_TIMER_RED_SEC = 60;

export type CardTimerState = {
  /** «ММ:СС»; минуты не ограничены 99 (после 99:59 — «100:00» и дальше). */
  text: string;
  /** Граница включительно: elapsed >= CARD_TIMER_RED_SEC. */
  isRed: boolean;
  /** false после передачи карточки: значение замирает на completedAt − answeredAt, цвет сохраняется. */
  running: boolean;
};

/** Таймер карточки; до «Принять» (нет answeredAt) карточки ещё нет — null. Отрицательного значения не бывает. */
export function cardTimer(attempt: OperatorAttempt, nowMs: number): CardTimerState | null {
  if (!attempt.answeredAt) return null;
  const elapsedSec = talkSeconds(attempt, nowMs);
  return {
    text: formatClock(elapsedSec),
    isRed: elapsedSec >= CARD_TIMER_RED_SEC,
    running: !attempt.completedAt,
  };
}
