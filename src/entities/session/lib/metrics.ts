import { MS_IN_SECOND } from "../config/norms";

const MINUS_SIGN = "−";

/** Отклонение от норматива в секундах со знаком: «+18 с», «−11 с», «0 с». */
export function formatDeviationSec(deviationSec: number): string {
  const rounded = Math.round(deviationSec);
  if (rounded > 0) return `+${rounded} с`;
  if (rounded < 0) return `${MINUS_SIGN}${Math.abs(rounded)} с`;
  return "0 с";
}

export function msToSec(valueMs: number): number {
  return Math.round(valueMs / MS_IN_SECOND);
}

export function getAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Секунды между двумя ISO-метками. */
export function getElapsedSec(fromIso: string, toIso: string): number {
  return Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / MS_IN_SECOND);
}
