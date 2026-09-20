"use client";

import { useState } from "react";

import type { WorkLineFormValues, WorkLinesControl } from "./types";

const EMPTY_VALUES: WorkLineFormValues = {
  service: "",
  calledTo: "",
  phone: "",
  person: "",
  message: "",
  confirmed: false,
};

/* Внутренние номера учебного контура (101–104, 112, 301–303) — без маски городского телефона. */
const INTERNAL_NUMBER = /^\d{3,4}$/;

export function isInternalNumber(phone: string): boolean {
  return INTERNAL_NUMBER.test(phone);
}

const REQUIRED_FIELDS: (keyof WorkLineFormValues)[] = ["service", "calledTo", "person", "message"];

/** Без подтверждающей галочки и обязательных полей отработка не сохраняется (п. 3.13). */
export function canSaveWorkLine(values: WorkLineFormValues): boolean {
  return values.confirmed && REQUIRED_FIELDS.every((field) => String(values[field]).trim().length > 0);
}

/** Варианты поля «Служба» по вводу (поиск по списку, регистр не различается). */
export function filterServices(serviceNames: string[], query: string): string[] {
  const needle = query.trim().toLocaleLowerCase("ru-RU");
  if (!needle) return serviceNames;
  return serviceNames.filter((name) => name.toLocaleLowerCase("ru-RU").includes(needle));
}

/** Состояние формы «Добавить отработку»: поля, автоподстановка телефона службы, сохранение. */
export function useWorkLineForm(control?: WorkLinesControl) {
  const [values, setValues] = useState<WorkLineFormValues>(EMPTY_VALUES);
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<TField extends keyof WorkLineFormValues>(
    field: TField,
    value: WorkLineFormValues[TField],
  ) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setError(null);
  }

  function selectService(service: string) {
    const phone = control?.phoneBook.find((entry) => entry.service === service)?.phone;
    setValues((previous) => ({ ...previous, service, phone: phone ?? previous.phone }));
  }

  async function save(): Promise<boolean> {
    if (!control || !canSaveWorkLine(values)) return false;
    setSaving(true);
    try {
      await control.onAdd(values);
      setValues(EMPTY_VALUES);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { values, setField, selectService, save, isSaving, error, canSave: canSaveWorkLine(values) };
}
