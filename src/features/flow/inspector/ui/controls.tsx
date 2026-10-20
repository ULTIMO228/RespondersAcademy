"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

import styles from "./FlowInspector.module.css";

type CommitTextProps = {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  type?: "text" | "number";
  min?: number;
  max?: number;
  hint?: ReactNode;
  tone?: "warning" | "error";
  disabled?: boolean;
};

/**
 * Текстовое поле, которое применяет значение при уходе из поля или по Enter: один шаг истории на правку, а не
 * на каждую букву. Внешнее изменение (отмена, другой блок) подхватывается, пока поле не в фокусе.
 */
export function CommitText({
  label,
  value,
  onCommit,
  multiline = false,
  type = "text",
  min,
  max,
  hint,
  tone,
  disabled,
}: CommitTextProps) {
  const id = useId();
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (document.activeElement !== ref.current) setDraft(value);
  }, [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    id,
    ref,
    value: draft,
    disabled,
    className: [styles.control, tone ? styles[`control--${tone}`] : ""].filter(Boolean).join(" "),
    "aria-describedby": hint ? `${id}-hint` : undefined,
    "aria-invalid": tone === "error" ? true : undefined,
    onBlur: commit,
  };
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={3} onChange={(event) => setDraft(event.target.value)} />
      ) : (
        <input
          {...common}
          type={type}
          min={min}
          max={max}
          inputMode={type === "number" ? "numeric" : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setDraft(value);
          }}
        />
      )}
      {hint ? (
        <span
          id={`${id}-hint`}
          className={[styles.hint, tone ? styles[`hint--${tone}`] : ""].filter(Boolean).join(" ")}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

type SelectProps = {
  label: string;
  value: string;
  options: { value: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: ReactNode;
  tone?: "warning" | "error";
  disabled?: boolean;
  compactLabel?: boolean;
};

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "Выберите…",
  hint,
  tone,
  disabled,
  compactLabel,
}: SelectProps) {
  const id = useId();
  return (
    <div className={compactLabel ? styles.nextRow : styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        className={[styles.control, tone ? styles[`control--${tone}`] : ""].filter(Boolean).join(" ")}
        aria-describedby={hint ? `${id}-hint` : undefined}
        aria-invalid={tone === "error" ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <span
          id={`${id}-hint`}
          className={[styles.hint, tone ? styles[`hint--${tone}`] : ""].filter(Boolean).join(" ")}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function Checkbox({
  label,
  checked,
  onChange,
  hint,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={styles.check}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={styles.check__box}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      <label htmlFor={id}>
        {label}
        {hint ? (
          <span id={`${id}-hint`} className={styles.hint}>
            {hint}
          </span>
        ) : null}
      </label>
    </div>
  );
}
