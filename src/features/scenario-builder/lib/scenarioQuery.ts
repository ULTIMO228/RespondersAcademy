import type { Difficulty, ScenarioListQuery, ScenarioSource, ScenarioValidationStatus } from "@/shared/api";

import type { ScenarioFilterState } from "../model/types";

export const EMPTY_FILTER: ScenarioFilterState = { categories: [], difficulty: "", source: "", status: "" };

/**
 * Фильтры панели → query `GET /api/mock/scenarios`: категории — повторным ключом `group`,
 * сложность — `difficulty`, источник — `source`, статус валидации — `validationStatus`.
 * Пустые значения не попадают в query (клиент `buildQuery` их опускает).
 */
export function buildScenarioQuery(filter: ScenarioFilterState): ScenarioListQuery {
  const query: ScenarioListQuery = {};
  if (filter.categories.length > 0) query.group = filter.categories;
  if (filter.difficulty) query.difficulty = [Number(filter.difficulty) as Difficulty];
  if (filter.source) query.source = filter.source as ScenarioSource;
  if (filter.status) query.validationStatus = filter.status as ScenarioValidationStatus;
  return query;
}

export function isEmptyFilter(filter: ScenarioFilterState): boolean {
  return filter.categories.length === 0 && !filter.difficulty && !filter.source && !filter.status;
}
