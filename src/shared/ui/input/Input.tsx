import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

import styles from "./Input.module.css";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: ReactNode;
  error?: string;
  tone?: "light" | "dark";
};

/** Поле ввода АРМ-112: подпись мелким кеглем над инпутом, нижняя граница-линия. */
export function Input({ label, hint, error, tone = "light", className, id, ...rest }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const classNames = [styles.field, styles[`field--${tone}`], error ? styles["field--error"] : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={classNames}>
      <label className={styles.field__label} htmlFor={inputId}>
        {label}
      </label>
      <input id={inputId} className={styles.field__input} aria-invalid={Boolean(error)} {...rest} />
      {hint ? <span className={styles.field__hint}>{hint}</span> : null}
      {error ? <span className={styles.field__error}>{error}</span> : null}
    </div>
  );
}
