"use client";

import { useState } from "react";

import { getNextTelephonyStatus, telephonyStore, useTelephonyStatus } from "@/entities/service";
import type { TelephonyStatus } from "@/entities/service";

/* Прототип / просмотр преподавателем: статичное состояние открытой карточки. */
const DETACHED_STATUS: TelephonyStatus = "unavailable";

/**
 * Статус линии оператора: в живом режиме — общий стор телефонии приложения (T2.3-02, софтфон читает его же),
 * иначе — локальное состояние блока (без влияния на стор).
 */
export function useLineStatus(isLive: boolean) {
  const storeStatus = useTelephonyStatus();
  const [localStatus, setLocalStatus] = useState<TelephonyStatus>(DETACHED_STATUS);
  if (isLive) return { status: storeStatus, toggle: () => telephonyStore.cycleStatus() };
  return { status: localStatus, toggle: () => setLocalStatus(getNextTelephonyStatus) };
}
