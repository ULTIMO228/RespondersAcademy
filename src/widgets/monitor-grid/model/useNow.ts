"use client";

import { useEffect, useState } from "react";

import { useMonitorDeps } from "./deps";

/** Шаг живых таймеров: секунда — как у таймеров карточки АРМ. */
const TICK_MS = 1000;

/**
 * Локальное «сейчас» для таймеров реакции/отработки (T3.3-02): считается на клиенте от issuedAt/openedAt,
 * поэтому при обрыве связи таймеры продолжают идти. Часы — из зависимостей (в тестах подменяются).
 */
export function useNow(isRunning = true): number {
  const { clock } = useMonitorDeps();
  const [nowMs, setNowMs] = useState(() => clock.now());

  useEffect(() => {
    if (!isRunning) return undefined;
    let handle = clock.setTimeout(function tick() {
      setNowMs(clock.now());
      handle = clock.setTimeout(tick, TICK_MS);
    }, TICK_MS);
    return () => clock.clearTimeout(handle);
  }, [clock, isRunning]);

  return nowMs;
}
