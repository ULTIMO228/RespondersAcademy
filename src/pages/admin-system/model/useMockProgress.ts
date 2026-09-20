"use client";

import { useEffect, useState } from "react";

const TICK_MS = 300;
const STEP_PERCENT = 10;
const DONE_PERCENT = 100;

/** Мок-прогресс длительной операции (бэкап, пакетное обновление) без реального API. */
export function useMockProgress() {
  const [progress, setProgress] = useState<number | null>(null);
  const isRunning = progress !== null && progress < DONE_PERCENT;

  useEffect(() => {
    if (!isRunning) return undefined;
    const timerId = window.setInterval(() => {
      setProgress((current) => Math.min(DONE_PERCENT, (current ?? 0) + STEP_PERCENT));
    }, TICK_MS);
    return () => window.clearInterval(timerId);
  }, [isRunning]);

  return {
    progress,
    isRunning,
    isDone: progress === DONE_PERCENT,
    start: () => setProgress(0),
  };
}
