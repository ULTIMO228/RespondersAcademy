const pad = (value: number) => String(value).padStart(2, "0");

/** Дата «дд.мм.гг» и время «чч:мм» строки журнала из ISO-времени создания (как в журнале 112). */
export function splitCreatedAt(iso: string): { date: string; time: string } {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return { date: iso, time: "" };
  return {
    date: `${pad(parsed.getDate())}.${pad(parsed.getMonth() + 1)}.${pad(parsed.getFullYear() % 100)}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}
