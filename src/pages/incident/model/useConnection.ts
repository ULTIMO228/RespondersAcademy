"use client";

import { useEffect, useSyncExternalStore } from "react";

import { appConnectivity, systemClock } from "@/shared/lib";
import type { Clock, Connectivity } from "@/shared/lib";

/* Автопереподключение: пока связи нет — проба мок-слоя раз в 5 сек (ТЗ §7: сбой ≤ 30 сек без потерь). */
export const RECONNECT_PROBE_MS = 5_000;

type UseConnectionOptions = {
  probe: () => Promise<unknown>;
  connectivity?: Connectivity;
  clock?: Clock;
};

/** Состояние связи приложения + периодическая проба мок-слоя в offline (успех → online). */
export function useConnection({
  probe,
  connectivity = appConnectivity,
  clock = systemClock,
}: UseConnectionOptions) {
  const isOnline = useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, () => true);

  useEffect(() => {
    if (isOnline) return undefined;
    let isCancelled = false;
    let timer = clock.setTimeout(function tick() {
      probe()
        .then(() => {
          if (!isCancelled) connectivity.markOnline();
        })
        .catch(() => {
          if (!isCancelled) timer = clock.setTimeout(tick, RECONNECT_PROBE_MS);
        });
    }, RECONNECT_PROBE_MS);
    return () => {
      isCancelled = true;
      clock.clearTimeout(timer);
    };
  }, [isOnline, probe, connectivity, clock]);

  return isOnline;
}
