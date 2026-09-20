import { useId } from "react";
import type { InputHTMLAttributes } from "react";

import styles from "./AuthForm.module.css";

type LoginFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

/** Поле экрана входа ПОВ-112 (ДДС_image1): подпись «логин:» мелко над полем, белая линия снизу. */
export function LoginField({ label, id, ...rest }: LoginFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div className={styles["auth-form__field"]}>
      <label className={styles["auth-form__label"]} htmlFor={inputId}>
        {label}
      </label>
      <input id={inputId} className={styles["auth-form__input"]} {...rest} />
    </div>
  );
}
