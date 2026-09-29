import { describeErrorType } from "@/entities/report";
import type { Recommendation } from "@/shared/api";
import { ROUTES } from "@/shared/config";

/**
 * Куда ведёт «Изучить» (A5): у рекомендации нет текста статьи — переход строится по `kind` и `targetId`.
 * article → статья справочника; category → справочник, отфильтрованный по группе; card/mode → задания.
 */
export function recommendationHref(recommendation: Recommendation): string {
  switch (recommendation.kind) {
    case "article":
      return ROUTES.referenceArticle(recommendation.targetId);
    case "category":
      return ROUTES.referenceSearch(recommendation.targetId);
    default:
      return ROUTES.studentAssignments;
  }
}

/** Причина рекомендации одной строкой (правила R10, R22… — на бэкенде; здесь только тип ошибки и число). */
export function describeReason(recommendation: Recommendation): string {
  const { errorType, count } = recommendation.reason;
  if (errorType === "modeGap") return "Режимы тренажёра отработаны неравномерно";
  return `${describeErrorType(errorType)} — ${count} ${pluralTimes(count)}`;
}

function pluralTimes(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return "раз";
  return last >= 2 && last <= 4 ? "раза" : "раз";
}
