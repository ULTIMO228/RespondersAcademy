"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

import { useDraggable } from "../model/useDraggable";
import { CardIcon } from "./CardIcon";

import styles from "./DraggableWindow.module.css";

type DraggableWindowProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
};

/* Стартовая позиция окна: под полосой телефонии карточки. */
const INITIAL_POSITION = { x: 120, y: 96 };

/**
 * Перетаскиваемое окно в стиле модалки ПОВ-112 (белое окно, заголовок, ✕; Esc закрывает): тянется за
 * заголовок, не выходит за пределы вьюпорта. Не блокирует карточку под собой.
 */
export function DraggableWindow({ title, onClose, children, width }: DraggableWindowProps) {
  const { position, windowRef, onPointerDown } = useDraggable(INITIAL_POSITION);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      ref={windowRef}
      className={styles.window}
      role="dialog"
      aria-label={title}
      style={{ left: position.x, top: position.y, width }}
      data-testid="draggable-window"
    >
      <header className={styles.window__header} onPointerDown={onPointerDown} title="Перетащите окно">
        <h2 className={styles.window__title}>{title}</h2>
        <button
          type="button"
          className={styles.window__close}
          onClick={onClose}
          onPointerDown={(event) => event.stopPropagation()}
          aria-label="Закрыть (Esc)"
          title="Закрыть (Esc)"
        >
          <CardIcon name="close" size={16} />
        </button>
      </header>
      <div className={styles.window__body}>{children}</div>
    </div>
  );
}
