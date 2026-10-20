"use client";

import { Glyph } from "@/shared/ui";

import styles from "./ApplicantRow112.module.css";

type ApplicantRow112Props = {
  name: string;
  status: string;
  onName: (value: string) => void;
  onStatus: (value: string) => void;
  /** Кнопка перевода (КАРТОЧКА_image1) — внешний переводчик не подключается, нажатие только сообщается. */
  onTranslate?: () => void;
  statusOptions?: string[];
  disabled?: boolean;
};

/** Варианты статуса заявителя учебного набора; точный список АРМ неизвестен (допущение). */
const DEFAULT_STATUSES = ["очевидец", "пострадавший", "родственник", "сотрудник организации"];

/** Ряд заявителя: «Фамилия и имя заявителя», «выберите статус», два выпадающих, кнопка перевода (КАРТОЧКА_image1). */
export function ApplicantRow112({
  name,
  status,
  onName,
  onStatus,
  onTranslate,
  statusOptions = DEFAULT_STATUSES,
  disabled = false,
}: ApplicantRow112Props) {
  const options = status && !statusOptions.includes(status) ? [status, ...statusOptions] : statusOptions;
  return (
    <div className={styles.row}>
      <input
        className={styles.row__name}
        value={name}
        placeholder="Фамилия и имя заявителя"
        aria-label="Фамилия и имя заявителя"
        disabled={disabled}
        onChange={(event) => onName(event.target.value)}
      />
      <select
        className={styles.row__select}
        value={status}
        aria-label="Статус заявителя"
        disabled={disabled}
        onChange={(event) => onStatus(event.target.value)}
      >
        <option value="">выберите статус</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {/* Два выпадающих списка АРМ без подписи; их содержимое не входит в учебный сценарий. */}
      <select className={styles.row__select} aria-label="Дополнительный список 1" disabled />
      <select className={styles.row__select} aria-label="Дополнительный список 2" disabled />
      <button
        type="button"
        className={styles.row__translate}
        aria-label="Перевод"
        disabled={disabled || !onTranslate}
        onClick={onTranslate}
      >
        <Glyph name="translate" size={20} />
      </button>
    </div>
  );
}
