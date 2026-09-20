"use client";

import { useEffect, useState } from "react";

import { useJournalDeps } from "./deps";

/** Шаг живых часов и таймеров ленты — 1 сек. */
export const TICK_MS = 1000;

/**
 * «Сейчас» ленты с тиком раз в секунду (часы шапки, таймеры 30 сек, бейдж занятия, напоминания).
 * initialMs — время сервера на момент рендера: первый клиентский рендер совпадает с серверным (гидратация).
 */
export function useNow(initialMs?: number): number {
  const { clock } = useJournalDeps();
  const [nowMs, setNowMs] = useState(() => initialMs ?? clock.now());
  useEffect(() => {
    setNowMs(clock.now());
    const handle = setInterval(() => setNowMs(clock.now()), TICK_MS);
    return () => clearInterval(handle);
  }, [clock]);
  return nowMs;
}
