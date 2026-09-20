"use client";

import type { StatusOption } from "../model/types";

import styles from "./StatusSelect.module.css";

type StatusSelectProps = {
  options: StatusOption[];
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: (status: string) => void;
};

const PLACEHOLDER = "Статус";

/** Дропдаун «Статус» формы смены статуса (ДДС_image14, p24_Image111): недоступные пункты — неактивны. */
export function StatusSelect({ options, value, isOpen, onToggle, onSelect }: StatusSelectProps) {
  const selected = options.find((option) => option.status === value);
  return (
    <div className={styles.select}>
      <button
        type="button"
        className={styles.select__button}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={PLACEHOLDER}
        onClick={onToggle}
      >
        <span className={selected ? undefined : styles.select__placeholder}>
          {selected?.title ?? PLACEHOLDER}
        </span>
        <svg
          className={isOpen ? styles["select__arrow--open"] : styles.select__arrow}
          width="8"
          height="5"
          viewBox="0 0 8 5"
          aria-hidden="true"
        >
          <path d="M0 0h8L4 5z" fill="currentColor" />
        </svg>
      </button>
      {isOpen ? (
        <ul className={styles.select__list} role="listbox" aria-label={PLACEHOLDER}>
          {options.map((option) => (
            <li key={option.status} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={option.status === value}
                aria-disabled={!option.isAvailable}
                disabled={!option.isAvailable}
                className={[
                  styles.select__option,
                  option.status === value ? styles["select__option--selected"] : "",
                ].join(" ")}
                title={option.isAvailable ? undefined : "Недоступно по последовательности статусов"}
                onClick={() => onSelect(option.status)}
              >
                {option.title}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
