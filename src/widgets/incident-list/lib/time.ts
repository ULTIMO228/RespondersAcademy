/*
 * Метки времени ленты в формате мок-слоя: ISO 8601 с московским смещением +03:00 (spec/000-фронт/mocks/README.md).
 * Поля datetime-local (расширенный поиск, напоминания) трактуются как московское настенное время.
 */
const MOSCOW_OFFSET = "+03:00";
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
/** «2026-09-17T11:20:00» — дата-время без миллисекунд и зоны. */
const ISO_DATE_TIME_LENGTH = 19;
/** «2026-09-17T11:20» — значение input[type=datetime-local]. */
const LOCAL_INPUT_LENGTH = 16;
const LOCAL_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** мс эпохи → «2026-09-17T11:20:00+03:00». */
export function toMoscowIso(epochMs: number): string {
  const shifted = new Date(epochMs + MOSCOW_OFFSET_MS);
  return `${shifted.toISOString().slice(0, ISO_DATE_TIME_LENGTH)}${MOSCOW_OFFSET}`;
}

/** мс эпохи → значение datetime-local в московском времени («2026-09-17T11:20»). */
export function toMoscowInputValue(epochMs: number): string {
  return toMoscowIso(epochMs).slice(0, LOCAL_INPUT_LENGTH);
}

/** Значение datetime-local (московское время) → ISO +03:00; пустое/некорректное → undefined. */
export function fromMoscowInputValue(value: string): string | undefined {
  const trimmed = value.trim();
  if (!LOCAL_INPUT_PATTERN.test(trimmed)) return undefined;
  const withSeconds = trimmed.length === LOCAL_INPUT_LENGTH ? `${trimmed}:00` : trimmed;
  return `${withSeconds}${MOSCOW_OFFSET}`;
}
