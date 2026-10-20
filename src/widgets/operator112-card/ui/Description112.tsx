"use client";

import { useId } from "react";

import styles from "./Description112.module.css";

/** Предел описания со слов заявителя (КАРТОЧКА_image1: «0 / 1999»). */
export const DESCRIPTION_MAX = 1999;

type Description112Props = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

/** Блок «Описание со слов заявителя» со счётчиком «N / 1999» (спека 009, T040). */
export function Description112({ value, onChange, disabled = false }: Description112Props) {
  const id = useId();
  return (
    <div className={styles.description} data-block="description">
      <label className={styles.description__label} htmlFor={id}>
        Описание со слов заявителя
      </label>
      <textarea
        id={id}
        className={styles.description__text}
        value={value}
        placeholder="введите"
        maxLength={DESCRIPTION_MAX}
        disabled={disabled}
        // maxLength не защищает от вставки в некоторых окружениях — обрезаем явно.
        onChange={(event) => onChange(event.target.value.slice(0, DESCRIPTION_MAX))}
      />
      <span className={styles.description__counter} aria-live="off">
        {value.length} / {DESCRIPTION_MAX}
      </span>
    </div>
  );
}
