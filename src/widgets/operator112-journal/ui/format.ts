/** Форматирование даты и времени шапки/таблицы журнала 112 (референс ИНСТРУКЦИЯ_106). */
const WEEKDAYS = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

const pad = (n: number) => String(n).padStart(2, "0");

/** «Четверг, 27 Июнь 2019». */
export function formatHeaderDate(ms: number): string {
  const d = new Date(ms);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Часы «11:39» и секунды «49» отдельно (секунды в шапке мельче). */
export function formatClock(ms: number): { hm: string; s: string } {
  const d = new Date(ms);
  return { hm: `${pad(d.getHours())}:${pad(d.getMinutes())}`, s: pad(d.getSeconds()) };
}

/** «26.06.19»-подобная дата и «20:15» из ISO-строки; нераспознанное значение отдаётся как есть. */
export function splitCreatedAt(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  return { date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${pad(d.getFullYear() % 100)}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
