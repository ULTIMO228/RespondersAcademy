"use client";

import { useEffect, useState } from "react";

import { useJournalDeps } from "./deps";
import { readStored, STORAGE_KEYS, writeStored } from "./storedValue";

/**
 * Молния «важное происшествие» (T2.2-10): пометка по id карточки, независима от страницы списка и
 * переживает автообновление/перезагрузку (хранилище браузера).
 */
export function useImportantMarks() {
  const { storage } = useJournalDeps();
  const [ids, setIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setIds(new Set(readStored<string[]>(storage, STORAGE_KEYS.important, [])));
  }, [storage]);

  /** Переключает пометку; возвращает новое состояние (true — отмечена важной). */
  function toggle(id: string): boolean {
    const next = new Set(ids);
    const isMarked = !next.has(id);
    if (isMarked) next.add(id);
    else next.delete(id);
    setIds(next);
    writeStored(storage, STORAGE_KEYS.important, [...next]);
    return isMarked;
  }

  return { ids, toggle };
}
