"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";

import styles from "./Modal.module.css";

type ModalProps = {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Модальное окно ПОВ-112 (референс КАРТОЧКА_image3): белое окно поверх затемнения, ✕ и Esc закрывают. */
export function Modal({ title, onClose, children, footer, width }: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  /*
   * Клавиатура (T5.2-02): при открытии фокус уходит в окно — экранный диктор объявляет заголовок
   * окна, — при закрытии возвращается на кнопку, которая окно открыла. Вид окна не меняется.
   */
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    modalRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  /* Tab не уходит на страницу под затемнением: цикл замкнут внутри окна. */
  const handleTabLoop = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const items = getFocusable(modalRef.current);
    if (items.length === 0) {
      event.preventDefault();
      modalRef.current?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && (active === first || active === modalRef.current)) {
      event.preventDefault();
      last.focus();
    }
  }, []);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        ref={modalRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={width ? { width } : undefined}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleTabLoop}
      >
        <header className={styles.modal__header}>
          <h2 className={styles.modal__title} id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.modal__close}
            onClick={onClose}
            aria-label="Закрыть (Esc)"
            title="Закрыть (Esc)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" />
            </svg>
          </button>
        </header>
        <div className={styles.modal__body}>{children}</div>
        {footer ? <footer className={styles.modal__footer}>{footer}</footer> : null}
      </div>
    </div>
  );
}
