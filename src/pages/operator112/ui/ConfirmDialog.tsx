"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Подтверждение недоступно (например, не заполнено поле окна). */
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Модальное окно подтверждения в стиле служебных окон АРМ-112 (оранжевое, как окно блокировки ИНСТРУКЦИЯ_94):
 * «Закрыть карточку без сохранения?», подтверждение оповещения служб, постановка напоминания. Esc = отмена.
 */
export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  cancelLabel = "отмена",
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => confirmRef.current?.focus(), []);

  return (
    <div className={styles.overlay}>
      <div
        className={styles.window}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 id={titleId} className={styles.window__title}>
          {title}
        </h2>
        {children ? <div className={styles.window__body}>{children}</div> : null}
        <div className={styles.window__actions}>
          <button
            ref={confirmRef}
            type="button"
            className={styles.window__confirm}
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
          <button type="button" className={styles.window__cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
