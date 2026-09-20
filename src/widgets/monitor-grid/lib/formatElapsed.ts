/* Живое время от старта занятия: «12:05» до часа, «1:23:45» — дольше (24 ч, без AM/PM). */
const MS_IN_SECOND = 1000;
const SECONDS_IN_MINUTE = 60;
const MINUTES_IN_HOUR = 60;

export function formatElapsed(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / MS_IN_SECOND));
  const seconds = totalSeconds % SECONDS_IN_MINUTE;
  const totalMinutes = Math.floor(totalSeconds / SECONDS_IN_MINUTE);
  const minutes = totalMinutes % MINUTES_IN_HOUR;
  const hours = Math.floor(totalMinutes / MINUTES_IN_HOUR);
  const tail = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${tail}` : tail;
}
