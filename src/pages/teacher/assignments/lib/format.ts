/** Дата ISO 8601 → «29.09.2026»; нераспознанное значение возвращается как есть. */
export function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}
