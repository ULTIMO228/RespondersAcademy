"use client";

import { useEffect, useState } from "react";

import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import { createTicker } from "../lib/ticker";

/** «Сейчас» в мс, обновляется раз в секунду, пока active; часы подменяются в тестах. */
export function useNow(active = true, clock: Clock = systemClock): number {
  const [nowMs, setNowMs] = useState(() => clock.now());
  useEffect(() => {
    if (!active) return undefined;
    setNowMs(clock.now());
    return createTicker(clock, setNowMs);
  }, [active, clock]);
  return nowMs;
}
