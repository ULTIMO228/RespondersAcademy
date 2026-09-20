"use client";

import { useEffect, useEffectEvent, useState } from "react";

type CardHotkeyHandlers = {
  /** Esc вне полей и открытых окон — закрыть карточку. */
  onClose: () => void;
  /** Shift+F1 — «Просмотр». */
  onView: () => void;
  /** Shift+F2 — «Дополнить». */
  onAmend: () => void;
  /** Alt+S (режим просмотра) — «Завершить»: форма статуса реагирования. */
  onFinish: () => void;
};

/* Открытое всплывающее окно закрывает Esc само (модалки, форма статуса, попап истории). */
const OPEN_POPUP_SELECTOR =
  '[role="dialog"], [role="alertdialog"], form[aria-label="Смена статуса реагирования"]';
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;
}

function hasOpenPopup(): boolean {
  return document.querySelector(OPEN_POPUP_SELECTOR) !== null;
}

/**
 * Единый обработчик горячих клавиш карточки (T2.3-19): зажатый Alt — подсказки; Esc, Shift+F1, Shift+F2,
 * Alt+S — действия режима просмотра. Комбинации режима создания (Alt+T, Alt+A, …) и Insert не действуют.
 * Внутри полей ввода хоткеи не срабатывают.
 */
export function useCardHotkeys(handlers: CardHotkeyHandlers) {
  const [isAltHeld, setAltHeld] = useState(false);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === "Alt") {
      setAltHeld(true);
      return;
    }
    if (isEditableTarget(event.target)) return;
    if (event.key === "Escape" && !hasOpenPopup()) handlers.onClose();
    else if (event.shiftKey && event.key === "F1") handlers.onView();
    else if (event.shiftKey && event.key === "F2") handlers.onAmend();
    else if (event.altKey && event.code === "KeyS") handlers.onFinish();
    else return;
    event.preventDefault();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Alt") setAltHeld(false);
    };
    const onBlur = () => setAltHeld(false);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return { isAltHeld };
}
