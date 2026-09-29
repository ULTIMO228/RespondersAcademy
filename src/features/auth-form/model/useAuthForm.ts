import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";

import type { LoginRequest, LoginResult } from "@/shared/api";

import { AUTH_MESSAGES } from "../config/authConfig";
import type { AuthCredentials } from "./types";
import { useLoginRequest } from "./useLoginRequest";
import type { LoginRequestFn } from "./useLoginRequest";

type UseAuthFormOptions = {
  initialCredentials: AuthCredentials;
  onSuccess: (result: LoginResult) => void;
  loginRequest?: LoginRequestFn;
};

function toLoginRequest(credentials: AuthCredentials): LoginRequest {
  return {
    login: credentials.login.trim(),
    password: credentials.password,
  };
}

function useCredentials(initialCredentials: AuthCredentials) {
  const [credentials, setCredentials] = useState<AuthCredentials>(initialCredentials);
  const updateCredential = (field: keyof AuthCredentials, nextValue: string) =>
    setCredentials((current) => ({ ...current, [field]: nextValue }));
  return { credentials, updateCredential };
}

/** Вход: логин и пароль → сервер выдаёт cookie сессии → редирект. Токен клиент не хранит. */
export function useAuthForm({ initialCredentials, onSuccess, loginRequest }: UseAuthFormOptions) {
  const { credentials, updateCredential } = useCredentials(initialCredentials);
  const request = useLoginRequest(loginRequest);

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.isPending) return;
    if (!credentials.login.trim() || !credentials.password)
      return request.setError(AUTH_MESSAGES.credentialsRequired);
    const result = await request.submit(toLoginRequest(credentials));
    if (result) onSuccess(result);
  }

  /*
   * Явная отправка по Enter (spec/000-фронт/04-pages/00-auth.md: «отправка также по Enter»).
   * На неявную отправку формы не полагаемся: она срабатывает не во всех браузерах и режимах ввода.
   */
  function handleEnterKey(event: KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter" || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.tagName !== "INPUT") return;
    event.preventDefault();
    event.currentTarget.requestSubmit();
  }

  const { error, isPending } = request;
  return {
    credentials,
    updateCredential,
    error,
    isPending,
    handleCredentialsSubmit,
    handleEnterKey,
  };
}
