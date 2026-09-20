"use client";

import { useEffect, useSyncExternalStore } from "react";

import { telephonyStore } from "./telephony";
import type { TelephonyStatus, TelephonyStore } from "./telephony";

/** Текущий статус линии оператора из стора приложения. */
export function useTelephonyStatus(store: TelephonyStore = telephonyStore): TelephonyStatus {
  return useSyncExternalStore(store.subscribe, store.getStatus, store.getStatus);
}

/** Регламент карточки: пока карточка открыта — «недоступен», после закрытия — удержание 10 сек. */
export function useCardTelephonyHold(isActive: boolean, store: TelephonyStore = telephonyStore): void {
  useEffect(() => {
    if (!isActive) return undefined;
    store.cardOpened();
    return () => store.cardClosed();
  }, [isActive, store]);
}
