import type { FormEvent, KeyboardEvent } from "react";
import { useState } from "react";

import { sessionStore } from "@/entities/user";
import type { AuthSession, LoginRequest } from "@/shared/api";

import { ARM_NUMBER_PATTERN, AUTH_MESSAGES } from "../config/authConfig";
import type { AuthCredentials } from "./types";
import { useLoginRequest } from "./useLoginRequest";
import type { LoginRequestFn } from "./useLoginRequest";

type UseAuthFormOptions = {
  initialCredentials: AuthCredentials;
  onSuccess: (session: AuthSession) => void;
  loginRequest?: LoginRequestFn;
};

function toLoginRequest(credentials: AuthCredentials): LoginRequest {
  return {
    login: credentials.login.trim(),
    password: credentials.password,
    armNumber: Number(credentials.armNumber.trim()),
  };
}

function useCredentials(initialCredentials: AuthCredentials) {
  const [credentials, setCredentials] = useState<AuthCredentials>(initialCredentials);
  const updateCredential = (field: keyof AuthCredentials, nextValue: string) =>
    setCredentials((current) => ({ ...current, [field]: nextValue }));
  return { credentials, updateCredential };
}

/** Вход: логин, пароль и номер АРМ → серверная сессия → редирект. */
export function useAuthForm({ initialCredentials, onSuccess, loginRequest }: UseAuthFormOptions) {
  const { credentials, updateCredential } = useCredentials(initialCredentials);
  const request = useLoginRequest(loginRequest);
  const complete = (session: AuthSession) => {
    sessionStore.set(session);
    onSuccess(session);
  };

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.isPending) return;
    if (!ARM_NUMBER_PATTERN.test(credentials.armNumber.trim()))
      return request.setError(AUTH_MESSAGES.armRequired);
    const session = await request.submit(toLoginRequest(credentials));
    if (!session) return;
    complete(session);
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
