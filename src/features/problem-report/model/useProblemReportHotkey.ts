"use client";

import { useEffect, useEffectEvent } from "react";

/**
 * Сочетание Alt+M из карточки открывает «Сообщить о проблеме» (FR-030, FR-032). Код клавиши (`KeyM`) — не символ:
 * сочетание работает и при русской раскладке. Shift и Ctrl/Meta отменяют срабатывание.
 */
export function isProblemReportHotkey(
  event: Pick<KeyboardEvent, "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
) {
  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "KeyM";
}

/** Подписка на Alt+M на время жизни компонента; `enabled = false` — сочетание не слушается. */
export function useProblemReportHotkey(onOpen: () => void, enabled = true): void {
  const open = useEffectEvent(onOpen);

  useEffect(() => {
    if (!enabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (!isProblemReportHotkey(event)) return;
      event.preventDefault();
      open();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
