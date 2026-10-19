import type { ErrorMapSettings } from "@/shared/api";

/**
 * Поля формы порогов. Проценты вводятся строками, как их видит администратор («10» → 0,10 в API).
 * Ключи совпадают с полями `ErrorMapSettings`, чтобы ошибки ложились на поля без перевода имён.
 */
export type ErrorMapSettingsFormValues = {
  sometimesFrom: string;
  oftenFrom: string;
  minAttemptsGroup: string;
  minAttemptsStudent: string;
  sameBandPoints: string;
};

export type ErrorMapSettingsFormField = keyof ErrorMapSettingsFormValues;
export type ErrorMapSettingsFormErrors = Partial<Record<ErrorMapSettingsFormField, string>>;

const PERCENT = 100;
const SAME_BAND_MAX_POINTS = 50;
const SHARE_DIGITS = 6;

const NOT_A_NUMBER = "Введите число";
const SOMETIMES_RULE = "Порог «иногда» — больше 0 % и меньше порога «часто»";
const OFTEN_RULE = "Порог «часто» — меньше 100 % и больше порога «иногда»";
const MIN_ATTEMPTS_RULE = "Целое число, не меньше 1";
const SAME_BAND_RULE = `Целое число от 0 до ${SAME_BAND_MAX_POINTS} п. п.`;

/** Пустая строка и пробелы — не число: Number("") даёт 0 и молча подменил бы поле. */
function parse(text: string): number {
  return text.trim() === "" ? Number.NaN : Number(text);
}

function isWhole(value: number, min: number, max = Number.POSITIVE_INFINITY): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

/** Зеркало серверной проверки `validate_error_map_settings`: 0 < «иногда» < «часто» < 100 %, зона 0–50, минимумы ≥ 1. */
export function validateErrorMapSettingsForm(values: ErrorMapSettingsFormValues): ErrorMapSettingsFormErrors {
  const sometimes = parse(values.sometimesFrom);
  const often = parse(values.oftenFrom);
  const sometimesKnown = Number.isFinite(sometimes);
  const oftenKnown = Number.isFinite(often);
  const errors: ErrorMapSettingsFormErrors = {};

  if (!sometimesKnown) errors.sometimesFrom = NOT_A_NUMBER;
  else if (!(sometimes > 0 && sometimes < PERCENT && (!oftenKnown || sometimes < often)))
    errors.sometimesFrom = SOMETIMES_RULE;

  if (!oftenKnown) errors.oftenFrom = NOT_A_NUMBER;
  else if (!(often > 0 && often < PERCENT && (!sometimesKnown || often > sometimes)))
    errors.oftenFrom = OFTEN_RULE;

  if (!isWhole(parse(values.minAttemptsGroup), 1)) errors.minAttemptsGroup = MIN_ATTEMPTS_RULE;
  if (!isWhole(parse(values.minAttemptsStudent), 1)) errors.minAttemptsStudent = MIN_ATTEMPTS_RULE;
  if (!isWhole(parse(values.sameBandPoints), 0, SAME_BAND_MAX_POINTS)) errors.sameBandPoints = SAME_BAND_RULE;

  return errors;
}

/** Проценты → доля для API: 30 → 0.3 (округление убирает хвосты двоичной арифметики). */
export function percentToShare(percent: number): number {
  return Number((percent / PERCENT).toFixed(SHARE_DIGITS));
}

/** Доля из API → текст процентов: 0.3 → «30» (без 30.000000000000004). */
export function shareToPercentText(share: number): string {
  return String(Math.round(share * PERCENT * 100) / 100);
}

/** Значения формы из ответа сервера. */
export function toFormValues(settings: ErrorMapSettings): ErrorMapSettingsFormValues {
  return {
    sometimesFrom: shareToPercentText(settings.sometimesFrom),
    oftenFrom: shareToPercentText(settings.oftenFrom),
    minAttemptsGroup: String(settings.minAttemptsGroup),
    minAttemptsStudent: String(settings.minAttemptsStudent),
    sameBandPoints: String(settings.sameBandPoints),
  };
}

/** Тело PUT /error-map/settings. Вызывать только для значений без ошибок валидации. */
export function toSettings(values: ErrorMapSettingsFormValues): ErrorMapSettings {
  return {
    sometimesFrom: percentToShare(parse(values.sometimesFrom)),
    oftenFrom: percentToShare(parse(values.oftenFrom)),
    minAttemptsGroup: parse(values.minAttemptsGroup),
    minAttemptsStudent: parse(values.minAttemptsStudent),
    sameBandPoints: parse(values.sameBandPoints),
  };
}
