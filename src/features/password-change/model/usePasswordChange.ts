"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { ApiError, changePassword, getAuthPolicy } from "@/shared/api";

import { DEFAULT_MIN_PASSWORD_LENGTH, validatePasswordChange } from "../lib/validation";
import type { PasswordChangeErrors, PasswordChangeInput } from "../lib/validation";

const HTTP_BAD_REQUEST = 400;
const EMPTY_INPUT: PasswordChangeInput = { currentPassword: "", newPassword: "", confirmPassword: "" };
const FAILURE_MESSAGE = "Не удалось изменить пароль. Повторите попытку";

export type PasswordChangeApi = {
  changePassword: (body: { currentPassword: string; newPassword: string }) => Promise<void>;
  /** Минимальная длина пароля по политике сервера; недоступна — значение по умолчанию. */
  loadMinLength: (signal?: AbortSignal) => Promise<number>;
};

const defaultApi: PasswordChangeApi = {
  changePassword: (body) => changePassword(body),
  loadMinLength: async (signal) => (await getAuthPolicy(undefined, signal)).minPasswordLength,
};

/**
 * Смена пароля: проверка формы → POST /auth/password. Сервер завершает остальные сессии, текущая остаётся.
 * Неверный текущий пароль и нарушение политики — 400 (не 401: 401 клиент считает истёкшей сессией).
 */
export function usePasswordChange(api: PasswordChangeApi = defaultApi) {
  const [input, setInput] = useState<PasswordChangeInput>(EMPTY_INPUT);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isPending, setPending] = useState(false);
  const [isDone, setDone] = useState(false);
  const [minLength, setMinLength] = useState(DEFAULT_MIN_PASSWORD_LENGTH);

  useEffect(() => {
    const controller = new AbortController();
    api
      .loadMinLength(controller.signal)
      .then((length) => {
        if (!controller.signal.aborted) setMinLength(length);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [api]);

  function update(field: keyof PasswordChangeInput, value: string) {
    setInput((current) => ({ ...current, [field]: value }));
    setDone(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    const found = validatePasswordChange(input, minLength);
    setErrors(found);
    setFormError(null);
    setDone(false);
    if (Object.keys(found).length > 0) return;
    setPending(true);
    try {
      await api.changePassword({ currentPassword: input.currentPassword, newPassword: input.newPassword });
      setInput(EMPTY_INPUT);
      setDone(true);
    } catch (failure) {
      setFormError(
        failure instanceof ApiError && failure.status === HTTP_BAD_REQUEST
          ? failure.message
          : FAILURE_MESSAGE,
      );
    } finally {
      setPending(false);
    }
  }

  return { input, errors, formError, isPending, isDone, minLength, update, submit };
}
