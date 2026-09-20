import type { ReactNode } from "react";

import { OTP_LENGTH } from "../config/authConfig";
import type { useAuthForm } from "../model/useAuthForm";
import { LoginField } from "./LoginField";
import styles from "./AuthForm.module.css";

type AuthCodeStepProps = {
  form: ReturnType<typeof useAuthForm>;
  errorMessage: ReactNode;
};

/** Шаг 2FA-заглушки «Код из сообщения» — в той же типографике, что и основная форма. */
export function AuthCodeStep({ form, errorMessage }: AuthCodeStepProps) {
  return (
    <form
      className={styles["auth-form"]}
      onSubmit={form.handleCodeSubmit}
      onKeyDown={form.handleEnterKey}
      aria-label="Подтверждение входа"
    >
      <p className={styles["auth-form__hint"]}>
        Код подтверждения отправлен в сообщении. Учётная запись: {form.credentials.login}
      </p>
      <LoginField
        label="код из сообщения:"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={OTP_LENGTH}
        value={form.code}
        onChange={(event) => form.setCode(event.target.value)}
        autoFocus
      />
      {errorMessage}
      <button
        type="submit"
        className={styles["auth-form__submit"]}
        disabled={form.isPending}
        aria-busy={form.isPending}
      >
        ВОЙТИ
      </button>
      <button type="button" className={styles["auth-form__back"]} onClick={form.goBack}>
        назад к вводу логина
      </button>
    </form>
  );
}
