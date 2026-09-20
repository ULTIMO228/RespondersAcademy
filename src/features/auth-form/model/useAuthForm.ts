import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import { sessionStore } from "@/entities/user";
import type { AuthSession, LoginRequest } from "@/shared/api";

import { ARM_NUMBER_PATTERN, AUTH_MESSAGES, OTP_PATTERN } from "../config/authConfig";
import type { AuthCredentials, AuthStep } from "./types";
import { useLoginRequest } from "./useLoginRequest";
import type { LoginRequestFn } from "./useLoginRequest";

type UseAuthFormOptions = {
  initialCredentials: AuthCredentials;
  isTwoFactorEnabled: boolean;
  onSuccess: (session: AuthSession) => void;
  loginRequest?: LoginRequestFn;
};

function toLoginRequest(credentials: AuthCredentials, twoFactorCode?: string): LoginRequest {
  const request = {
    login: credentials.login.trim(),
    password: credentials.password,
    armNumber: Number(credentials.armNumber.trim()),
  };
  return twoFactorCode === undefined ? request : { ...request, twoFactorCode };
}

function useCredentials(initialCredentials: AuthCredentials) {
  const [credentials, setCredentials] = useState<AuthCredentials>(initialCredentials);
  const updateCredential = (field: keyof AuthCredentials, nextValue: string) =>
    setCredentials((current) => ({ ...current, [field]: nextValue }));
  return { credentials, updateCredential };
}

type LoginRequestState = ReturnType<typeof useLoginRequest>;

/** Шаг 2FA-заглушки: код из сообщения (любые 6 цифр) → повторный вход с twoFactorCode. */
function useCodeStep(request: LoginRequestState, complete: (session: AuthSession) => void) {
  const [code, setCode] = useState("");

  async function submitCode(credentials: AuthCredentials) {
    if (request.isPending) return;
    if (!OTP_PATTERN.test(code.trim())) return request.setError(AUTH_MESSAGES.invalidCode);
    const session = await request.submit(toLoginRequest(credentials, code.trim()));
    if (session) complete(session);
  }

  return { code, setCode, submitCode };
}

/** Шаги входа: логин/пароль/АРМ (POST /auth/login) → код из сообщения (2FA) → сессия → редирект. */
export function useAuthForm({
  initialCredentials,
  isTwoFactorEnabled,
  onSuccess,
  loginRequest,
}: UseAuthFormOptions) {
  const [step, setStep] = useState<AuthStep>("credentials");
  const { credentials, updateCredential } = useCredentials(initialCredentials);
  const request = useLoginRequest(loginRequest);
  const complete = (session: AuthSession) => {
    sessionStore.set(session);
    onSuccess(session);
  };
  const codeStep = useCodeStep(request, complete);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.isPending) return;
    if (!ARM_NUMBER_PATTERN.test(credentials.armNumber.trim()))
      return request.setError(AUTH_MESSAGES.armRequired);
    const session = await request.submit(toLoginRequest(credentials));
    if (!session) return;
    if (isTwoFactorEnabled) return setStep("code");
    complete(session);
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void codeStep.submitCode(credentials);
  }

  /*
   * Явная отправка по Enter (spec/04-pages/00-auth.md: «отправка также по Enter»).
   * На неявную отправку формы не полагаемся: она срабатывает не во всех браузерах и режимах ввода.
   */
  function handleEnterKey(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  function goBack() {
    setStep("credentials");
    codeStep.setCode("");
    request.setError(null);
  }

  const { code, setCode } = codeStep;
  const { error, isPending } = request;
  return {
    step,
    credentials,
    updateCredential,
    code,
    setCode,
    error,
    isPending,
    handleCredentialsSubmit,
    handleCodeSubmit,
    handleEnterKey,
    goBack,
  };
}
