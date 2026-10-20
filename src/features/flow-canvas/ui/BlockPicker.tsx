"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { FLOW_BLOCKS, FLOW_LIBRARY_TYPES } from "@/entities/scenario-flow";
import type { FlowNodeType } from "@/entities/scenario-flow";
import { PfIcon } from "@/shared/ui/platform";

import styles from "./FlowCanvas.module.css";

type BlockPickerProps = {
  /** Экранная точка внутри поля, у которой открылось меню. */
  at: { x: number; y: number };
  title: string;
  onPick: (type: FlowNodeType) => void;
  onClose: () => void;
};

/** Меню «+ Добавить шаг» / «Вставить шаг сюда»: выбор блока без перетаскивания (design-concept.md §3). */
export function BlockPicker({ at, title, onPick, onClose }: BlockPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("button")?.focus();
  }, []);
  return (
    <div
      ref={ref}
      className={styles.picker}
      style={{ left: at.x, top: at.y }}
      role="dialog"
      aria-label={title}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className={styles.picker__head}>
        <b>{title}</b>
        <button type="button" className={styles.picker__close} onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      <ul className={styles.picker__list}>
        {FLOW_LIBRARY_TYPES.map((type) => {
          const block = FLOW_BLOCKS[type];
          return (
            <li key={type}>
              <button
                type="button"
                className={styles.picker__item}
                style={{ "--cat": `var(--pf-flow-cat-${block.group})` } as CSSProperties}
                onClick={() => onPick(type)}
              >
                <span className={styles.tile} aria-hidden="true">
                  <PfIcon name={block.icon} size={18} />
                </span>
                {block.title}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
