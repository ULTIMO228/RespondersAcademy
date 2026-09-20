"use client";

import { useEffect, useEffectEvent } from "react";

/* Горячие клавиши списка (spec/04-pages/01-arm-main.md «Действия», 07 «Горячие клавиши»). */

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

type JournalHotkeys = {
  /** Esc — закрыть попап/форму и вернуться к списку (модалки закрываются сами). */
  onEscape: () => void;
  /** Insert — создать карточку: у обучающегося неактивно (только подсказка). */
  onInsert: () => void;
};

/** Внутри полей ввода хоткеи не срабатывают. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return EDITABLE_TAGS.has(target.tagName) || target.isContentEditable;
}

export function useJournalHotkeys({ onEscape, onInsert }: JournalHotkeys): void {
  const handleKey = useEffectEvent((event: KeyboardEvent) => {
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape") onEscape();
    if (event.key === "Insert") {
      event.preventDefault();
      onInsert();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKey(event);
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}
