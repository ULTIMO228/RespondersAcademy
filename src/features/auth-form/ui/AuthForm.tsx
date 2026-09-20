"use client";

import { useRouter } from "next/navigation";

import { resolvePostLoginRoute } from "../lib/redirect";
import type { AuthCredentials } from "../model/types";
import { useAuthForm } from "../model/useAuthForm";
import { useAuthPolicy } from "../model/useAuthPolicy";
import type { AuthPolicyRequestFn } from "../model/useAuthPolicy";
import type { LoginRequestFn } from "../model/useLoginRequest";
import { AuthCodeStep } from "./AuthCodeStep";
import { LoginField } from "./LoginField";
import styles from "./AuthForm.module.css";

type AuthFormProps = {
  /** Предзаполнение демо-учёткой (как автозаполнение браузера на ДДС_image1). */
  initialCredentials?: AuthCredentials;
  /** Шаг 2FA включён по умолчанию (ТЗ §5), отключается настройкой. */
  isTwoFactorEnabled?: boolean;
  /** Запрошенный до входа URL (гвард → /login?returnUrl=…); проверяется резолвером. */
  returnUrl?: string | null;
  /** Подмена вызова POST /api/mock/auth/login (тесты); по умолчанию — login() из shared/api. */
  loginRequest?: LoginRequestFn;
  /** Подмена GET /api/mock/auth/policy (тесты); по умолчанию — getAuthPolicy() из shared/api. */
  authPolicyRequest?: AuthPolicyRequestFn;
};

const EMPTY_CREDENTIALS: AuthCredentials = { login: "", password: "", armNumber: "" };

/** Форма «112 ВХОД В СИСТЕМУ»: логин · пароль · номер АРМ → «ВОЙТИ» → код из сообщения. */
export function AuthForm({
  initialCredentials = EMPTY_CREDENTIALS,
  isTwoFactorEnabled = true,
  returnUrl,
  loginRequest,
  authPolicyRequest,
}: AuthFormProps) {
  const router = useRouter();
  /* Шаг кода требует и флага окружения, и настройки администратора «Требовать 2FA» (T4.2-17). */
  const isTwoFactorRequiredBySettings = useAuthPolicy(authPolicyRequest);
  const form = useAuthForm({
    initialCredentials,
    isTwoFactorEnabled: isTwoFactorEnabled && isTwoFactorRequiredBySettings,
    loginRequest,
    onSuccess: (session) => router.replace(resolvePostLoginRoute(session.role, returnUrl)),
  });
  const errorMessage = form.error ? (
    <p className={styles["auth-form__error"]} role="alert">
      {form.error}
    </p>
  ) : null;

  if (form.step === "code") {
    return <AuthCodeStep form={form} errorMessage={errorMessage} />;
  }

  return (
    <form
      className={styles["auth-form"]}
      onSubmit={form.handleCredentialsSubmit}
      onKeyDown={form.handleEnterKey}
      aria-label="Вход в систему"
    >
      <LoginField
        label="логин:"
        name="login"
        autoComplete="username"
        value={form.credentials.login}
        onChange={(event) => form.updateCredential("login", event.target.value)}
      />
      <LoginField
        label="пароль:"
        name="password"
        type="password"
        autoComplete="current-password"
        value={form.credentials.password}
        onChange={(event) => form.updateCredential("password", event.target.value)}
      />
      <LoginField
        label="номер АРМ:"
        name="armNumber"
        inputMode="numeric"
        value={form.credentials.armNumber}
        onChange={(event) => form.updateCredential("armNumber", event.target.value)}
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
    </form>
  );
}
