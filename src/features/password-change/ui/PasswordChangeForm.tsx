"use client";

import { Alert, Field, PlatformButton } from "@/shared/ui/platform";

import { usePasswordChange } from "../model/usePasswordChange";
import type { PasswordChangeApi } from "../model/usePasswordChange";
import styles from "./PasswordChangeForm.module.css";

/** Форма смены пароля: текущий, новый (по политике длины), подтверждение. Успех: остальные сессии завершены. */
export function PasswordChangeForm({ api }: { api?: PasswordChangeApi }) {
  const form = usePasswordChange(api);
  return (
    <form className={styles.form} onSubmit={form.submit} aria-label="Смена пароля" noValidate>
      <Field
        label="Текущий пароль"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        value={form.input.currentPassword}
        error={form.errors.currentPassword}
        onChange={(event) => form.update("currentPassword", event.target.value)}
      />
      <Field
        label="Новый пароль"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        hint={`Не менее ${form.minLength} символов`}
        value={form.input.newPassword}
        error={form.errors.newPassword}
        onChange={(event) => form.update("newPassword", event.target.value)}
      />
      <Field
        label="Повторите новый пароль"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        value={form.input.confirmPassword}
        error={form.errors.confirmPassword}
        onChange={(event) => form.update("confirmPassword", event.target.value)}
      />
      {form.formError ? (
        <Alert tone="danger" role="alert">
          {form.formError}
        </Alert>
      ) : null}
      {form.isDone ? (
        <Alert tone="success">
          Пароль изменён. Вход на других устройствах завершён, здесь вы остаётесь в системе.
        </Alert>
      ) : null}
      <div>
        <PlatformButton type="submit" variant="primary" disabled={form.isPending} aria-busy={form.isPending}>
          Сменить пароль
        </PlatformButton>
      </div>
    </form>
  );
}
