"use client";

import type { ReactNode } from "react";

import styles from "./Tabs.module.css";

export type TabItem = {
  id: string;
  title: ReactNode;
};

type TabsProps = {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  label: string;
};

/** Вкладки в стиле панели разделов ПОВ-112 (тёмные вкладки, активная — синяя). */
export function Tabs({ items, activeId, onChange, label }: TabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === activeId}
          className={[styles.tabs__tab, item.id === activeId ? styles["tabs__tab--active"] : ""].join(" ")}
          onClick={() => onChange(item.id)}
        >
          {item.title}
        </button>
      ))}
    </div>
  );
}
