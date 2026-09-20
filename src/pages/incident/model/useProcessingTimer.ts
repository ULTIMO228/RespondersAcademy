"use client";

import { useEffect, useState } from "react";

import { isNormExceeded, parseIsoMs } from "@/entities/session";
import { formatDuration, systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

const TICK_MS = 1_000;

type UseProcessingTimerOptions = {
  /** CardEvent.openedAt — старт таймера 3:00. */
  openedAt: string;
  /** Завершение попытки — таймер останавливается на факте fullProcessingMs. */
  completedAt: string | null;
  /** Норматив полной обработки, мс (Scenario.timeNorms или 3 мин по умолчанию). */
  normMs: number;
  clock?: Clock;
};

/** Целые секунды: «3:00» на 180-й секунде ещё норма, «3:01» — превышение (строго больше норматива). */
function toWholeSecondsMs(ms: number): number {
  return Math.floor(Math.max(0, ms) / TICK_MS) * TICK_MS;
}

/**
 * Тикающий таймер отработки (T2.3-04): считает от открытия карточки; при превышении норматива — exceeded
 * (краснеют таймер и шапка). Идёт локально, в т.ч. при потере связи; интервал очищается при unmount.
 */
export function useProcessingTimer({
  openedAt,
  completedAt,
  normMs,
  clock = systemClock,
}: UseProcessingTimerOptions) {
  const [now, setNow] = useState(() => clock.now());

  useEffect(() => {
    if (completedAt) return undefined;
    let timer = clock.setTimeout(function tick() {
      setNow(clock.now());
      timer = clock.setTimeout(tick, TICK_MS);
    }, TICK_MS);
    return () => clock.clearTimeout(timer);
  }, [clock, completedAt]);

  const endMs = completedAt ? parseIsoMs(completedAt) : now;
  const elapsedMs = toWholeSecondsMs(endMs - parseIsoMs(openedAt));
  return { elapsedMs, value: formatDuration(elapsedMs), isExceeded: isNormExceeded(elapsedMs, normMs) };
}
