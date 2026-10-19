import type { ErrorMapStageLevel } from "@/shared/api";

/** Подпись с числами для плитки и ячейки журнала: «60% · 3 из 5» или «попыток: N», когда данных для вывода нет. */
export function countText(level: ErrorMapStageLevel): string {
  if (level.level === "noData") return `попыток: ${level.attempts}`;
  const percent = level.share === null ? "" : `${Math.round(level.share * 100)}% · `;
  return `${percent}${level.attemptsWithError} из ${level.attempts}`;
}
