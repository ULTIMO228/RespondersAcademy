/* Метки времени тренажёра — ISO 8601 с московским смещением +03:00 (соглашение моков). */
const MOSCOW_OFFSET = "+03:00";
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const ISO_DATE_TIME_LENGTH = 19;

export function toMoscowIso(epochMs: number): string {
  return `${new Date(epochMs + MOSCOW_OFFSET_MS).toISOString().slice(0, ISO_DATE_TIME_LENGTH)}${MOSCOW_OFFSET}`;
}
