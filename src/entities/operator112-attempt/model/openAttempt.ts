"use client";

import { useSyncExternalStore } from "react";

/*
 * Реестр открытой (не завершённой) попытки обучающегося в симуляторе (спека 007, FR-014): экран попытки сообщает,
 * что она идёт, а переключатель зон спрашивает подтверждение, прежде чем уйти в другую роль. Хранится в памяти вкладки;
 * сама попытка живёт на сервере, поэтому потеря реестра ничего не теряет, а лишь убирает вопрос.
 */

export type OpenAttempt = {
  /** Что именно не завершено, словами для диалога («Билет 112: Пожар в жилом доме»). */
  title: string;
};

let current: OpenAttempt | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

/** Отметить открытую попытку; null — попытка завершена или экран закрыт. */
export function setOpenAttempt(value: OpenAttempt | null): void {
  if (current === value) return;
  if (current !== null && value !== null && current.title === value.title) return;
  current = value;
  emit();
}

export function getOpenAttempt(): OpenAttempt | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Реактивное чтение: переключатель зон показывает подтверждение, пока попытка не завершена. */
export function useOpenAttempt(): OpenAttempt | null {
  return useSyncExternalStore(subscribe, getOpenAttempt, () => null);
}
