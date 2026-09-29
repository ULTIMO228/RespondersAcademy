import type { ReactNode } from "react";

import styles from "./AssignmentWizard.module.css";

type CheckRowProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  type?: "checkbox" | "radio";
};

/** Строка с флажком: вся строка — цель нажатия (≥ 24×24), подпись связана с полем. */
export function CheckRow({ checked, onChange, children, disabled, type = "checkbox" }: CheckRowProps) {
  return (
    <label className={styles.check} data-checked={checked || undefined}>
      <input
        type={type}
        className={styles.check__input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={styles.check__label}>{children}</span>
    </label>
  );
}
