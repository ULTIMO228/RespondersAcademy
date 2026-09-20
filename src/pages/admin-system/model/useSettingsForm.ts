"use client";

import { useCallback, useState } from "react";

import type { SystemSettingsPatch } from "@/shared/api";
import { validateSettingsPatch } from "@/shared/api";

import type { SaveResult } from "./useAdminSystem";

export type SettingsFormState = {
  /** Ошибки по полям патча: ключ — путь поля (`backup.periodHours`). */
  errors: Record<string, string>;
  status: "idle" | "saving" | "saved" | "error";
  message?: string;
};

export type SettingsForm = SettingsFormState & {
  submit: (patch: SystemSettingsPatch) => Promise<boolean>;
  reset: () => void;
};

const IDLE: SettingsFormState = { errors: {}, status: "idle" };

function toMap(errors: { field: string; message: string }[]): Record<string, string> {
  return Object.fromEntries(errors.map((error) => [error.field, error.message]));
}

/** Живая (до отправки) проверка полей секции — те же правила, что и на сервере (422). */
export function liveErrors(patch: SystemSettingsPatch): Record<string, string> {
  return toMap(validateSettingsPatch(patch));
}

/** Сохранение секции настроек: ошибки полей от общего валидатора, текст 422 — под формой. */
export function useSettingsForm(save: (patch: SystemSettingsPatch) => Promise<SaveResult>): SettingsForm {
  const [state, setState] = useState<SettingsFormState>(IDLE);

  const submit = useCallback(
    async (patch: SystemSettingsPatch) => {
      setState({ errors: {}, status: "saving" });
      const result: SaveResult = await save(patch);
      if (result.ok) {
        setState({ errors: {}, status: "saved" });
        return true;
      }
      setState({ errors: toMap(result.fields), status: "error", message: result.message });
      return false;
    },
    [save],
  );

  const reset = useCallback(() => setState(IDLE), []);
  return { ...state, submit, reset };
}
