/*
 * Метки времени мок-слоя: ISO 8601 с московским смещением +03:00 (соглашение spec/mocks/README.md).
 * В тестах время фиксируется через vi.useFakeTimers() / vi.setSystemTime().
 */

const MOSCOW_OFFSET = "+03:00";
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
/** "2026-09-17T11:20:00" — длина даты-времени без миллисекунд и зоны. */
const ISO_DATE_TIME_LENGTH = 19;

/** Дата → "YYYY-MM-DDTHH:mm:ss+03:00" (Москва без перехода на летнее время). */
export function toMoscowIso(date: Date): string {
  const shifted = new Date(date.getTime() + MOSCOW_OFFSET_MS);
  return `${shifted.toISOString().slice(0, ISO_DATE_TIME_LENGTH)}${MOSCOW_OFFSET}`;
}

/** Текущее серверное время в формате мок-слоя. */
export function nowIso(): string {
  return toMoscowIso(new Date());
}

/** Метка ISO → epoch ms; невалидная → NaN. */
export function parseIso(value: string): number {
  return Date.parse(value);
}
