"use client";

import { useCallback, useEffect, useState } from "react";

import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

/* Тексты уведомлений мок-блокировки (spec п. 11, источник п. 3.13). */
export const AMEND_BLOCKED_NOTICE = "Вы не можете вносить изменения";
export const AMEND_RELEASED_NOTICE = "Карточка снова доступна для внесения изменений";
const MS_IN_SECOND = 1000;

type UseAmendModeOptions = {
  /** Мок-флаг: карточку дополняет другой пользователь N секунд (?amendLock=N); 0 — блокировки нет. */
  lockSeconds: number;
  /** СМС-карточка: текст СМС — в «Описание со слов заявителя» (п. 14). */
  initialDescription: string;
  onSave: (description: string, onSiteDigits: string) => void;
  clock?: Clock;
};

/**
 * Режим дополнения (Shift+F2, T2.3-15): открывает незаполненные поля и «Описание со слов заявителя»;
 * мок-блокировка параллельного редактирования с уведомлениями о запрете и о снятии блокировки.
 */
export function useAmendMode({
  lockSeconds,
  initialDescription,
  onSave,
  clock = systemClock,
}: UseAmendModeOptions) {
  const [isActive, setActive] = useState(false);
  const [isBlocked, setBlocked] = useState(lockSeconds > 0);
  const [notice, setNotice] = useState<string | null>(lockSeconds > 0 ? AMEND_BLOCKED_NOTICE : null);
  const [description, setDescription] = useState(initialDescription);
  const [onSiteDigits, setOnSiteDigits] = useState("");

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = clock.setTimeout(() => {
      setBlocked(false);
      setNotice(AMEND_RELEASED_NOTICE);
    }, lockSeconds * MS_IN_SECOND);
    return () => clock.clearTimeout(timer);
  }, [clock, lockSeconds]);

  const start = useCallback(() => {
    setActive(true);
    setNotice(isBlocked ? AMEND_BLOCKED_NOTICE : null);
  }, [isBlocked]);

  const view = useCallback(() => setActive(false), []);

  const save = useCallback(() => {
    if (isBlocked || !description.trim()) return;
    onSave(description.trim(), onSiteDigits);
    setDescription("");
    setActive(false);
  }, [description, isBlocked, onSave, onSiteDigits]);

  return {
    isActive,
    isBlocked,
    notice,
    description,
    onDescriptionChange: setDescription,
    onSiteDigits,
    onOnSiteChange: setOnSiteDigits,
    onStart: start,
    onView: view,
    onSave: save,
  };
}
