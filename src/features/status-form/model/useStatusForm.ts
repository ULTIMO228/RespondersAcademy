"use client";

import { useState } from "react";

import type { StatusFormValues } from "./types";

const EMPTY_VALUES: StatusFormValues = { status: "", dutyNumber: "", comment: "" };

/** Локальное состояние формы смены статуса (волна 0 — без сохранения на сервер). */
export function useStatusForm(initialDutyNumber = "") {
  const [values, setValues] = useState<StatusFormValues>({ ...EMPTY_VALUES, dutyNumber: initialDutyNumber });

  function setField(field: keyof StatusFormValues, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
  }

  return { values, setField };
}
