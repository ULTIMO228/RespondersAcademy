"use client";

import { useState } from "react";

import styles from "./CategoryMultiSelect.module.css";

type CategoryMultiSelectProps = {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
};

/** Мультиселект групп ЕКП: выпадающий список с чекбоксами (выбранные — синие, как чипы ПОВ-112). */
export function CategoryMultiSelect({ label, options, selected, onChange }: CategoryMultiSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = (option: string) =>
    onChange(selected.includes(option) ? selected.filter((item) => item !== option) : [...selected, option]);
  const summary = selected.length === 0 ? "все группы ЕКП" : `выбрано: ${selected.length}`;
  return (
    <div className={styles.multi}>
      <span className={styles.multi__label}>{label}</span>
      <button
        type="button"
        className={styles.multi__toggle}
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
      >
        {summary}
      </button>
      {isOpen ? (
        <ul className={styles.multi__list} aria-label={label}>
          {options.map((option) => (
            <li key={option}>
              <label
                className={[
                  styles.multi__option,
                  selected.includes(option) ? styles["multi__option--on"] : "",
                ].join(" ")}
              >
                <input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} />
                {option}
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
