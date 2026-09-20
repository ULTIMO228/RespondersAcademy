"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

import { STATEMENT_MAX_LENGTH, STATEMENT_PLACEHOLDER } from "../config/constants";

import styles from "./StatementForm.module.css";

type StatementFormProps = {
  label: string;
  /** Подсказка-пример под полем (текст сценария «введение текста»). */
  hint?: string;
  readOnly?: boolean;
  /** Управляемый режим: значение и обработчик ввода (без них — локальное состояние). */
  value?: string;
  onChange?: (value: string) => void;
  /** Поле заблокировано (карточка закрыта для редактирования / редактирует другой пользователь). */
  disabled?: boolean;
  /** Строка состояния сохранения («Черновик сохранён»). */
  status?: string;
  /** Дополнительные поля блока (напр. «Номер наряда»). */
  children?: ReactNode;
};

/**
 * Блок свободного текста в стиле штатного «Описание со слов заявителя» (p15_Image74):
 * подпись мелким кеглем, поле «введите» с линией снизу, счётчик «0 / 1999».
 */
export function StatementForm(props: StatementFormProps) {
  const { label, hint, readOnly = false, value, onChange, disabled = false, status, children } = props;
  const fieldId = useId();
  const [localText, setLocalText] = useState("");
  const text = value ?? localText;

  function handleChange(next: string) {
    if (onChange) onChange(next);
    else setLocalText(next);
  }

  return (
    <div className={styles.statement}>
      <label className={styles.statement__label} htmlFor={fieldId}>
        {label}
      </label>
      <textarea
        id={fieldId}
        className={styles.statement__field}
        placeholder={STATEMENT_PLACEHOLDER}
        maxLength={STATEMENT_MAX_LENGTH}
        value={text}
        readOnly={readOnly}
        disabled={readOnly || disabled}
        rows={2}
        onChange={(event) => handleChange(event.target.value)}
      />
      <div className={styles.statement__footer}>
        {hint ? <span className={styles.statement__hint}>{hint}</span> : <span />}
        {status ? (
          <span className={styles.statement__hint} role="status">
            {status}
          </span>
        ) : null}
        <span className={styles.statement__counter}>
          {text.length} / {STATEMENT_MAX_LENGTH}
        </span>
      </div>
      {children ? <div className={styles.statement__extra}>{children}</div> : null}
    </div>
  );
}
