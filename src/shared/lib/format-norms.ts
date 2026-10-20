/* Форматирование показателей рейтинга и профиля обучающегося (спека 006): время, доли, баллы. */

/** Секунды с одним знаком: 23 750 мс → «23,8 с»; null — «—». */
export function formatSeconds(ms: number | null): string {
  if (ms === null) return "—";
  return `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
}

/** Минуты:секунды для отработки: 135 000 мс → «2:15». */
export function formatMinutes(ms: number | null): string {
  if (ms === null) return "—";
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatShare(share: number | null): string {
  return share === null ? "—" : `${Math.round(share * 100)} %`;
}

export function formatScore(score: number | null): string {
  return score === null ? "—" : score.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}
