"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Input } from "@/shared/ui";

type NumberFieldProps = {
  label: string;
  value: number;
  min: number;
  hint?: ReactNode;
  /** Сообщение при значении ниже минимума (нормативы и темп — строго больше 0). */
  errorText: string;
  onCommit: (value: number) => void;
};

/**
 * Числовое поле мастера: показывает ввод как есть, наверх отдаёт только корректное значение (≥ min).
 * Некорректный ввод остаётся в поле с пояснением — значение занятия не меняется.
 */
export function NumberField({ label, value, min, hint, errorText, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const parsed = Number(draft);
  const isValid = draft.trim() !== "" && Number.isFinite(parsed) && parsed >= min;
  return (
    <Input
      label={label}
      type="number"
      min={min}
      value={draft}
      hint={hint}
      error={isValid ? undefined : errorText}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const candidate = Number(next);
        if (next.trim() !== "" && Number.isFinite(candidate) && candidate >= min) onCommit(candidate);
      }}
    />
  );
}
