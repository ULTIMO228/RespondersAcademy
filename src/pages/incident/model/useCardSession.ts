"use client";

import { useCallback, useMemo, useState } from "react";

import { useCardTelephonyHold } from "@/entities/service";
import { getCard } from "@/shared/api";
import type { CardRuntimeState } from "@/shared/api";
import { createWebStorage } from "@/shared/lib";
import type { KeyValueStorage } from "@/shared/lib";

import { outboxStorageKey } from "../lib/outbox";
import { useConnection } from "./useConnection";
import { useOutbox } from "./useOutbox";

/** localStorage за интерфейсом shared/lib (недоступность хранилища не ломает экран). */
export const browserStorage: KeyValueStorage = createWebStorage(() =>
  typeof window === "undefined" ? undefined : window.localStorage,
);

type UseCardSessionOptions = {
  cardId: string;
  studentId: string;
  runtime: CardRuntimeState;
  storage: KeyValueStorage;
};

/**
 * Инфраструктура открытой карточки: регламент линии телефонии, связь с мок-слоем (проба и переподключение),
 * буфер действий и актуальный рантайм карточки (после досылки буфера — перечитывается).
 */
export function useCardSession({
  cardId,
  studentId,
  runtime: initialRuntime,
  storage,
}: UseCardSessionOptions) {
  const [runtime, setRuntime] = useState(initialRuntime);
  useCardTelephonyHold(true);

  const probe = useCallback(() => getCard(cardId), [cardId]);
  const reload = useCallback(() => {
    probe()
      .then((details) => setRuntime(details.runtime))
      .catch(() => undefined);
  }, [probe]);
  const isOnline = useConnection({ probe });
  const storageKey = useMemo(() => outboxStorageKey(cardId, studentId), [cardId, studentId]);
  const outbox = useOutbox({ storage, storageKey, isOnline, onFlushed: reload });

  return { runtime, isOnline, outbox };
}
