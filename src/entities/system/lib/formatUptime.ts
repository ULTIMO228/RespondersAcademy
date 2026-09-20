const SECONDS_IN_MINUTE = 60;
const SECONDS_IN_HOUR = 3_600;
const SECONDS_IN_DAY = 86_400;

const pad = (value: number) => String(value).padStart(2, "0");

/** Аптайм «12 д 06:00» (дни + часы:минуты); «—» для остановленного сервиса. */
export function formatUptime(totalSeconds: number): string {
  if (totalSeconds <= 0) return "—";
  const days = Math.floor(totalSeconds / SECONDS_IN_DAY);
  const hours = Math.floor((totalSeconds % SECONDS_IN_DAY) / SECONDS_IN_HOUR);
  const minutes = Math.floor((totalSeconds % SECONDS_IN_HOUR) / SECONDS_IN_MINUTE);
  return `${days} д ${pad(hours)}:${pad(minutes)}`;
}
