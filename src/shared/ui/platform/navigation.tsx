"use client";

import type { ReactNode } from "react";

import styles from "./navigation.module.css";

export type TabNavItem = { id: string; title: ReactNode };

type TabNavProps = {
  items: TabNavItem[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
};

/** Вкладки разделов страницы (справочник, профиль): роль tab, стрелки переключают вкладки. */
export function TabNav({ items, activeId, onChange, label }: TabNavProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          id={`tab-${item.id}`}
          aria-selected={item.id === activeId}
          tabIndex={item.id === activeId ? 0 : -1}
          className={styles.tabs__tab}
          onClick={() => onChange(item.id)}
          onKeyDown={(event) => {
            const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            event.preventDefault();
            const next = items[(index + step + items.length) % items.length];
            onChange(next.id);
            document.getElementById(`tab-${next.id}`)?.focus();
          }}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}

type SegmentedControlProps<TValue extends string> = {
  options: { value: TValue; label: string }[];
  value: TValue;
  onChange: (value: TValue) => void;
  label: string;
};

/** Переключатель режима отображения/фильтра (Все · Активные · Выполненные). */
export function SegmentedControl<TValue extends string>({
  options,
  value,
  onChange,
  label,
}: SegmentedControlProps<TValue>) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.segmented__item}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type StepperProps = { steps: string[]; current: number };

/** Шаги мастера (T047): пройденные отмечены, текущий — aria-current="step". */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className={styles.stepper}>
      {steps.map((title, index) => {
        const state = index < current ? "done" : index === current ? "current" : "";
        return (
          <li
            key={title}
            className={[styles.stepper__item, state ? styles[`stepper__item--${state}`] : ""]
              .filter(Boolean)
              .join(" ")}
            aria-current={index === current ? "step" : undefined}
          >
            <span className={styles.stepper__number}>{index < current ? "✓" : index + 1}</span>
            {title}
          </li>
        );
      })}
    </ol>
  );
}
