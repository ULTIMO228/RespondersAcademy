"use client";

import { useEffect, useRef } from "react";

/**
 * Сочетания АРМ-112 (спека 009, FR-032). Ключ карты — «Модификатор+event.code» (`Shift+F1`, `Alt+KeyA`, `Enter`): по code,
 * чтобы сочетания работали и в русской раскладке. Enter срабатывает только вне полей ввода и кнопок (там у него свой смысл), Esc — вне полей ввода.
 */
export type HotkeyMap = Record<string, () => void>;

const INTERACTIVE = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"]);
/** Esc в поле ввода закрывает его подсказки, а не карточку. */
const TEXT_FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function comboOf(
  event: Pick<KeyboardEvent, "code" | "altKey" | "shiftKey" | "ctrlKey" | "metaKey">,
): string {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.metaKey) parts.push("Meta");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  parts.push(event.code);
  return parts.join("+");
}

export function useHotkeys(map: HotkeyMap, enabled = true) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      const combo = comboOf(event);
      const handler = mapRef.current[combo];
      if (!handler) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (combo === "Enter" && target && (INTERACTIVE.has(target.tagName) || target.isContentEditable))
        return;
      if (combo === "Escape" && target && (TEXT_FIELDS.has(target.tagName) || target.isContentEditable))
        return;
      event.preventDefault();
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
