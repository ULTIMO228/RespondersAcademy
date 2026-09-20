import type { InternalNumber } from "@/shared/api";

import { DIAL_MESSAGES, MAX_DIAL_LENGTH, MIN_DIAL_LENGTH } from "../config/callControl";

export type DialCheck =
  { ok: true; entry: InternalNumber } | { ok: false; reason: keyof typeof DIAL_MESSAGES; message: string };

const DIGITS_ONLY = /^\d+$/;

/** Формат внутреннего номера: только цифры, 3–4 знака. */
export function isDialFormatValid(value: string): boolean {
  return DIGITS_ONLY.test(value) && value.length >= MIN_DIAL_LENGTH && value.length <= MAX_DIAL_LENGTH;
}

/** Проверка набранного номера: формат → наличие в справочнике internalNumbers. */
export function checkDialNumber(value: string, numbers: readonly InternalNumber[]): DialCheck {
  const number = value.trim();
  if (!isDialFormatValid(number)) return { ok: false, reason: "format", message: DIAL_MESSAGES.format };
  const entry = numbers.find((candidate) => candidate.number === number);
  if (!entry) return { ok: false, reason: "notFound", message: DIAL_MESSAGES.notFound };
  return { ok: true, entry };
}
