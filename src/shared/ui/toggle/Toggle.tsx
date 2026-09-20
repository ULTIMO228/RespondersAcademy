import styles from "./Toggle.module.css";

type ToggleProps = {
  label: string;
  checked: boolean;
  onChange?: (checked: boolean) => void;
  tone?: "light" | "dark";
  disabled?: boolean;
};

/** Тумблер-бегунок ПОВ-112 («автообновление» на главном экране, p12_Image66). */
export function Toggle({ label, checked, onChange, tone = "light", disabled }: ToggleProps) {
  return (
    <label className={[styles.toggle, styles[`toggle--${tone}`]].join(" ")}>
      <input
        type="checkbox"
        role="switch"
        className={styles.toggle__input}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
      <span className={styles.toggle__track} aria-hidden="true">
        <span className={styles.toggle__thumb} />
      </span>
      <span className={styles.toggle__label}>{label}</span>
    </label>
  );
}
