import { useId } from "react";
import type { SelectHTMLAttributes } from "react";

import styles from "./Select.module.css";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  tone?: "light" | "dark" | "boxed";
};

/** Выпадающий список АРМ-112: линия снизу и треугольник-стрелка справа. */
export function Select({ label, options, placeholder, tone = "light", className, id, ...rest }: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <div className={[styles.select, styles[`select--${tone}`], className].filter(Boolean).join(" ")}>
      {label ? (
        <label className={styles.select__label} htmlFor={selectId}>
          {label}
        </label>
      ) : null}
      <select id={selectId} className={styles.select__control} {...rest}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
