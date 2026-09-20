"use client";

import { useEffect, useState } from "react";

import { useJournalDeps } from "./deps";
import { toErrorMessage } from "./loadStatus";
import { readStored, STORAGE_KEYS, writeStored } from "./storedValue";

/** Повтор окна напоминания, закрытого без действий (spec/04-pages/01-arm-main.md, источник п. 3.13). */
export const REMINDER_REPEAT_MS = 20_000;

export type JournalReminder = {
  id: string;
  cardId: string;
  cardNumber: number;
  href: string;
  text: string;
  remindAt: string;
  /** Следующий показ окна (после «закрыть» — +20 сек). */
  nextAlertAt: number;
};

export type ReminderDraft = Pick<JournalReminder, "cardId" | "cardNumber" | "href" | "text" | "remindAt">;

/**
 * Будильник «напоминание» (T2.2-11): создание — POST /api/mock/cards/[id]/reminders; окно срабатывает по
 * времени, «закрыть» без действий — повтор каждые 20 сек; удалить / переназначить (меняется только время).
 * Удаления в мок-слое нет — список ведётся на клиенте (хранилище браузера).
 */
/** Список напоминаний в хранилище браузера (загрузка после монтирования, запись при каждом изменении). */
function useStoredReminders() {
  const { storage } = useJournalDeps();
  const [reminders, setReminders] = useState<JournalReminder[]>([]);
  useEffect(() => {
    setReminders(readStored<JournalReminder[]>(storage, STORAGE_KEYS.reminders, []));
  }, [storage]);
  function update(change: (current: JournalReminder[]) => JournalReminder[]) {
    setReminders((current) => {
      const next = change(current);
      writeStored(storage, STORAGE_KEYS.reminders, next);
      return next;
    });
  }
  return { reminders, update };
}

export function useReminders(nowMs: number) {
  const { api } = useJournalDeps();
  const { reminders, update } = useStoredReminders();
  const patch = (id: string, change: Partial<JournalReminder>) =>
    update((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));

  async function create(draft: ReminderDraft): Promise<string | null> {
    try {
      const request = { text: draft.text, remindAt: draft.remindAt };
      const created = await api.postCardReminder(draft.cardId, request);
      const reminder = { ...draft, id: created.id, remindAt: created.remindAt };
      update((current) => [...current, { ...reminder, nextAlertAt: Date.parse(created.remindAt) }]);
      return null;
    } catch (error) {
      return toErrorMessage(error);
    }
  }

  return {
    reminders,
    due: reminders.find((reminder) => reminder.nextAlertAt <= nowMs) ?? null,
    create,
    snooze: (id: string) => patch(id, { nextAlertAt: nowMs + REMINDER_REPEAT_MS }),
    remove: (id: string) => update((current) => current.filter((item) => item.id !== id)),
    reassign: (id: string, remindAt: string) => patch(id, { remindAt, nextAlertAt: Date.parse(remindAt) }),
  };
}
