"use client";

import { useCallback, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

type DialogFocus<T extends HTMLElement> = {
  ref: React.RefObject<T | null>;
  onKeyDown: (event: ReactKeyboardEvent<T>) => void;
};

/*
 * Форма смены статуса лежит поверх затемнения — это модальное окно по поведению (ДДС_image8–20):
 * фокус при открытии уходит на «Статус», Tab ходит по кругу внутри формы и не проваливается на
 * карточку под затемнением, при закрытии возвращается на плитку службы. Вид формы не меняется.
 */
export function useDialogFocus<T extends HTMLElement>(): DialogFocus<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<T>) => {
    if (event.key !== "Tab") return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault();
      last.focus();
    }
  }, []);

  return { ref, onKeyDown };
}
