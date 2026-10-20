"use client";

import { useCallback, useEffect, useState } from "react";

import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

const MS_IN_MINUTE = 60_000;

export type CardReminder = {
  /** Что сделать — текст из окна напоминания. */
  text: string;
  /** Момент срабатывания по часам клиента, мс с эпохи. */
  dueAtMs: number;
};

/** Поле «Минуты» окна напоминания: целое от 1. Иное значение напоминание не ставит. */
export function isReminderMinutes(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes >= 1;
}

/**
 * Напоминание карточки 112 (спека 009, FR-031, research R10): поставить на N минут с текстом, сработать по часам клиента,
 * «напомнить позже» на N минут, удалить. Состояние живёт в экране попытки: переживает смену вида, но после перезагрузки
 * страницы теряется (допущение; событие reminderSet не нужно — напоминание не оценивается).
 * Хук ДДС (widgets/incident-list/model/useReminders) не используется: у 112 своя модель, ДДС не меняется.
 */
export function useCardReminder(clock: Clock = systemClock) {
  const [reminder, setReminder] = useState<CardReminder | null>(null);
  const [isDue, setDue] = useState(false);

  useEffect(() => {
    if (!reminder) return undefined;
    const handle = clock.setTimeout(() => setDue(true), Math.max(0, reminder.dueAtMs - clock.now()));
    return () => clock.clearTimeout(handle);
  }, [reminder, clock]);

  /** Поставить напоминание через minutes минут. Пустой текст или неверные минуты — false, состояние не меняется. */
  const set = useCallback(
    (minutes: number, text: string): boolean => {
      const trimmed = text.trim();
      if (!isReminderMinutes(minutes) || !trimmed) return false;
      setReminder({ text: trimmed, dueAtMs: clock.now() + minutes * MS_IN_MINUTE });
      setDue(false);
      return true;
    },
    [clock],
  );

  /** «Напомнить позже»: окно закрывается, срабатывание через minutes минут, текст сохраняется. Без напоминания — false. */
  const snooze = useCallback(
    (minutes: number): boolean => {
      if (!reminder || !isReminderMinutes(minutes)) return false;
      setReminder({ ...reminder, dueAtMs: clock.now() + minutes * MS_IN_MINUTE });
      setDue(false);
      return true;
    },
    [clock, reminder],
  );

  /** «Удалить напоминание»: снимает и напоминание, и окно. */
  const remove = useCallback(() => {
    setReminder(null);
    setDue(false);
  }, []);

  return { reminder, isDue, set, snooze, remove };
}
