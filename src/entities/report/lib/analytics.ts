/*
 * Сводка кабинета обучающегося по данным GET /me/analytics: средние с весом по числу попыток, оценка против нормативов
 * АРМ (реакция 30 с, отработка 3 мин), человекочитаемое имя типа ошибки. Типы `dynamics`/`topErrors` слабо
 * типизированы на бэкенде (списки без схемы значений) — форму фиксирует тест.
 */
import type { Analytics, LobbyMode } from "@/shared/api";

import { MISTAKE_CATEGORY_TITLES, PROCESSING_NORM_MS, REACTION_NORM_MS } from "../config/evaluation";
import { getMistakeCategory } from "./mistakes";

const MS_IN_SECOND = 1000;

export type PerformanceSummary = {
  attempts: number;
  /** null — попыток нет. */
  averageScore: number | null;
  reactionMs: number | null;
  processingMs: number | null;
};

function weighted(
  analytics: Analytics,
  pick: (stats: Analytics["byMode"][LobbyMode]) => number,
): number | null {
  const modes = Object.values(analytics.byMode).filter((stats) => stats.count > 0);
  const attempts = modes.reduce((sum, stats) => sum + stats.count, 0);
  if (attempts === 0) return null;
  return modes.reduce((sum, stats) => sum + pick(stats) * stats.count, 0) / attempts;
}

export function summarizePerformance(analytics: Analytics): PerformanceSummary {
  const attempts = Object.values(analytics.byMode).reduce((sum, stats) => sum + stats.count, 0);
  const score = weighted(analytics, (stats) => stats.averageScore);
  return {
    attempts,
    averageScore: score === null ? null : Math.round(score),
    reactionMs: weighted(analytics, (stats) => stats.averageReactionMs),
    processingMs: weighted(analytics, (stats) => stats.averageProcessingMs),
  };
}

export type NormTone = "good" | "bad" | "default";

/** Не больше норматива — в норме, больше — вне нормы; нет данных — нейтрально. */
export function toneAgainstNorm(valueMs: number | null, normMs: number): NormTone {
  if (valueMs === null) return "default";
  return valueMs <= normMs ? "good" : "bad";
}

/** 24 300 мс → «24 с». */
export function formatSecondsShort(ms: number): string {
  return `${Math.round(ms / MS_IN_SECOND)} с`;
}

export const REACTION_NORM_LABEL = `норматив ${REACTION_NORM_MS / MS_IN_SECOND} с`;
export const PROCESSING_NORM_LABEL = `норматив ${PROCESSING_NORM_MS / MS_IN_SECOND / 60} мин`;

/** Подпись типа ошибки: категория спеки + исходный код типа («Заполнение · addressMissing»). */
export function describeErrorType(errorType: string): string {
  const title = MISTAKE_CATEGORY_TITLES[getMistakeCategory(errorType)];
  return `${title} · ${errorType}`;
}
