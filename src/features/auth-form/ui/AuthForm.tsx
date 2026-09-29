"use client";

import { useRouter } from "next/navigation";

import { Alert, Field, PlatformButton } from "@/shared/ui/platform";

import { resolvePostLoginRoute } from "../lib/redirect";
import type { AuthCredentials } from "../model/types";
import { useAuthForm } from "../model/useAuthForm";
import type { LoginRequestFn } from "../model/useLoginRequest";
import styles from "./AuthForm.module.css";

type AuthFormProps = {
  /** Предзаполнение демо-учёткой (только демо-режим). */
  initialCredentials?: AuthCredentials;
  /** Запрошенный до входа URL (гвард → /login?returnUrl=…); проверяется резолвером. */
  returnUrl?: string | null;
  /** Подмена вызова POST /api/mock/auth/login (тесты); по умолчанию — login() из shared/api. */
  loginRequest?: LoginRequestFn;
};

const EMPTY_CREDENTIALS: AuthCredentials = { login: "", password: "" };

/** Форма входа платформы: логин · пароль → «Войти». Отказы нейтральны (не раскрывают, что именно неверно). */
export function AuthForm({ initialCredentials = EMPTY_CREDENTIALS, returnUrl, loginRequest }: AuthFormProps) {
  const router = useRouter();
  const form = useAuthForm({
    initialCredentials,
    loginRequest,
    onSuccess: (result) => router.replace(resolvePostLoginRoute(result.role, returnUrl)),
  });

  return (
    <form
      className={styles["auth-form"]}
      onSubmit={form.handleCredentialsSubmit}
      onKeyDown={form.handleEnterKey}
      aria-label="Вход в систему"
    >
      <h2 className={styles["auth-form__title"]}>Вход</h2>
      <Field
        label="Логин"
        name="login"
        autoComplete="username"
        value={form.credentials.login}
        onChange={(event) => form.updateCredential("login", event.target.value)}
      />
      <Field
        label="Пароль"
        name="password"
        type="password"
        autoComplete="current-password"
        value={form.credentials.password}
        onChange={(event) => form.updateCredential("password", event.target.value)}
      />
      {form.error ? (
        <Alert tone="danger" role="alert">
          {form.error}
        </Alert>
      ) : null}
      <PlatformButton
        type="submit"
        variant="primary"
        className={styles["auth-form__submit"]}
        disabled={form.isPending}
        aria-busy={form.isPending}
      >
        Войти
      </PlatformButton>
    </form>
  );
}
