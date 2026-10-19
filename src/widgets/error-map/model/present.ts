import type { ErrorMapHeadline } from "@/shared/api";

/** Параметр шага в query режима показа. */
export const STEP_PARAM = "step";

/** Этапы, которые показываются отдельными шагами: названные в выводе проблемные (не больше трёх). */
export function presentStageIds(headline: ErrorMapHeadline): string[] {
  return headline.kind === "problems" ? headline.stageIds : [];
}

/** Всего шагов: вывод и по одному шагу на каждый проблемный этап. */
export function presentTotal(headline: ErrorMapHeadline): number {
  return 1 + presentStageIds(headline).length;
}

/** Шаг из query: нумерация с 1; мусор, ноль и выход за границы заменяются ближайшим допустимым шагом. */
export function parseStep(raw: string | null | undefined, total: number): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, 1), Math.max(total, 1));
}
