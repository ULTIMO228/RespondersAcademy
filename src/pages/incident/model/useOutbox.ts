"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "@/shared/api";
import { appConnectivity } from "@/shared/lib";
import type { Connectivity, KeyValueStorage } from "@/shared/lib";

import { enqueue, readOutbox, writeOutbox } from "../lib/outbox";
import type { OutboxItem } from "../lib/outbox";
import { sendOutboxItem } from "./outboxSender";
import type { OutboxResult } from "./outboxSender";

const NETWORK_STATUS = 0;

export function isNetworkError(reason: unknown): boolean {
  return reason instanceof ApiError && reason.status === NETWORK_STATUS;
}

type UseOutboxOptions = {
  storage: KeyValueStorage;
  storageKey: string;
  isOnline: boolean;
  connectivity?: Connectivity;
  send?: (item: OutboxItem) => Promise<OutboxResult>;
  /** Буфер полностью дослан — обновить данные карточки с сервера. */
  onFlushed?: () => void;
};

/**
 * Буфер действий на время сбоя связи (T2.3-20): dispatch выполняет действие сразу, при сетевом сбое —
 * откладывает; после восстановления связи буфер досылается по порядку. Ошибка сервера (не сеть) — элемент
 * снимается с очереди, сообщение — в lastError.
 */
export function useOutbox(options: UseOutboxOptions) {
  const {
    storage,
    storageKey,
    isOnline,
    connectivity = appConnectivity,
    send = sendOutboxItem,
    onFlushed,
  } = options;
  const [items, setItems] = useState<OutboxItem[]>(() => readOutbox(storage, storageKey));
  const [lastError, setLastError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  const isFlushing = useRef(false);

  const commit = useCallback(
    (next: OutboxItem[]) => {
      itemsRef.current = next;
      writeOutbox(storage, storageKey, next);
      setItems(next);
    },
    [storage, storageKey],
  );

  const push = useCallback((item: OutboxItem) => commit(enqueue(itemsRef.current, item)), [commit]);

  const flush = useCallback(async () => {
    if (isFlushing.current) return;
    isFlushing.current = true;
    try {
      while (itemsRef.current.length > 0) {
        const [head, ...rest] = itemsRef.current;
        try {
          await send(head);
        } catch (reason) {
          if (isNetworkError(reason)) {
            connectivity.markOffline();
            return;
          }
          setLastError(reason instanceof Error ? reason.message : String(reason));
        }
        commit(rest);
      }
      onFlushed?.();
    } finally {
      isFlushing.current = false;
    }
  }, [commit, connectivity, onFlushed, send]);

  useEffect(() => {
    if (isOnline && items.length > 0) void flush();
  }, [isOnline, items.length, flush]);

  /** Выполнить действие сейчас; нет связи или сетевой сбой — отложить в буфер (результат null). */
  const dispatch = useCallback(
    async (item: OutboxItem): Promise<OutboxResult | null> => {
      if (!isOnline || itemsRef.current.length > 0) {
        push(item);
        return null;
      }
      try {
        return await send(item);
      } catch (reason) {
        if (!isNetworkError(reason)) throw reason;
        connectivity.markOffline();
        push(item);
        return null;
      }
    },
    [connectivity, isOnline, push, send],
  );

  return { pendingCount: items.length, dispatch, lastError };
}
