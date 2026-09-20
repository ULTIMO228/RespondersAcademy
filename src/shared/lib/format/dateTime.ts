/*
 * Русская локаль и 24-часовой формат (ТЗ §8). Часовой пояс — Москва: моки хранят время с +03:00.
 * Месяц в именительном падеже — как в шапке АРМ-112 («Четверг, 17 Сентябрь 2026»).
 */
const TIME_ZONE = "Europe/Moscow";
const LOCALE = "ru-RU";

const MONTHS_NOMINATIVE = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const SECONDS_IN_MINUTE = 60;
const MS_IN_SECOND = 1000;

function getParts(iso: string): Record<string, string> {
  const formatter = new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hourCycle: "h23",
  });
  return Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
}

/** «17.09.2026 11:13:19» */
export function formatDateTime(iso: string): string {
  const parts = getParts(iso);
  return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}:${parts.second}`;
}

/** «17.09.26» — колонка «Дата» списка происшествий. */
export function formatShortDate(iso: string): string {
  const parts = getParts(iso);
  return `${parts.day}.${parts.month}.${parts.year.slice(-2)}`;
}

/** «17.09.2026» */
export function formatDate(iso: string): string {
  const parts = getParts(iso);
  return `${parts.day}.${parts.month}.${parts.year}`;
}

/** «11:13:19» */
export function formatTime(iso: string): string {
  const parts = getParts(iso);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

/** «11:13» */
export function formatHourMinute(iso: string): string {
  const parts = getParts(iso);
  return `${parts.hour}:${parts.minute}`;
}

/** «Четверг, 17 Сентябрь 2026» — шапка главного экрана АРМ. */
export function formatHeaderDate(iso: string): string {
  const parts = getParts(iso);
  const weekday = parts.weekday.charAt(0).toUpperCase() + parts.weekday.slice(1);
  const month = MONTHS_NOMINATIVE[Number(parts.month) - 1];
  return `${weekday}, ${Number(parts.day)} ${month} ${parts.year}`;
}

/** Длительность в формате «м:сс» («0:30», «3:00»). */
export function formatDuration(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMs / MS_IN_SECOND));
  const minutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE);
  const seconds = totalSeconds % SECONDS_IN_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Длительность в формате «мм:сс» — записи разговоров. */
export function formatDurationPadded(totalMs: number): string {
  const [minutes, seconds] = formatDuration(totalMs).split(":");
  return `${minutes.padStart(2, "0")}:${seconds}`;
}
