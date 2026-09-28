/*
 * Нормативы и метрики таймингов попытки (T1.2-02). Единицы — миллисекунды (суффикс Ms в именах).
 * Формулы совпадают с валидатором spec/000-фронт/mocks/_tools/validate_mocks.py (дублирование осознанное):
 *   primaryReactionMs = openedAt − issuedAt, fullProcessingMs = completedAt − openedAt.
 * Единый источник истины — ISO-метки времени; разница не зависит от TZ процесса (метки несут смещение +03:00).
 */
import type { ScenarioTimeNorms } from "@/shared/api";

const MS_IN_SECOND = 1000;

/** Норматив заказчика: первичная реакция 30 сек (spec/000-фронт/05-data-models.md §6 timeNorms; Q&A в6). */
export const DEFAULT_PRIMARY_REACTION_MS = 30_000;
/** Норматив заказчика: полная обработка карточки 3 мин (spec/000-фронт/05-data-models.md §6 timeNorms; Q&A в6). */
export const DEFAULT_FULL_PROCESSING_MS = 180_000;

export type TimeNormsMs = {
  primaryReactionMs: number;
  fullProcessingMs: number;
};

/** Миллисекунды ISO-метки; некорректная метка — RangeError (не NaN в метриках). */
export function parseIsoMs(iso: string): number {
  const value = Date.parse(iso);
  if (Number.isNaN(value)) throw new RangeError(`Некорректная метка времени: «${iso}»`);
  return value;
}

function elapsedMs(fromIso: string, toIso: string): number {
  return parseIsoMs(toIso) - parseIsoMs(fromIso);
}

/** Первичная реакция: от выдачи карточки (CardFlowItem.issuedAt) до открытия (CardEvent.openedAt). */
export function primaryReactionMs(issuedAt: string, openedAt: string): number {
  return elapsedMs(issuedAt, openedAt);
}

/** Полная обработка: от открытия карточки до завершения (CardEvent.completedAt). */
export function fullProcessingMs(openedAt: string, completedAt: string): number {
  return elapsedMs(openedAt, completedAt);
}

/** Отклонение от норматива со знаком: > 0 — превышение. */
export function deviationMs(factMs: number, normMs: number): number {
  return factMs - normMs;
}

/** Превышение — строго больше норматива: ровно норматив (30_000 мс) нарушением не считается. */
export function isNormExceeded(factMs: number, normMs: number): boolean {
  return factMs > normMs;
}

/**
 * Итоговые нормативы: дефолты заказчика ← Scenario.timeNorms (сек) ← переопределения занятия (мс).
 * Оба норматива настраиваются раздельно (spec/000-фронт/04-pages/12-teacher-session.md п. 6).
 */
export function resolveTimeNorms(
  scenario?: { timeNorms?: ScenarioTimeNorms } | null,
  overrides?: Partial<TimeNormsMs>,
): TimeNormsMs {
  const scenarioNorms = scenario?.timeNorms;
  return {
    primaryReactionMs:
      overrides?.primaryReactionMs ??
      (scenarioNorms ? scenarioNorms.primaryReactionSec * MS_IN_SECOND : DEFAULT_PRIMARY_REACTION_MS),
    fullProcessingMs:
      overrides?.fullProcessingMs ??
      (scenarioNorms ? scenarioNorms.fullProcessingSec * MS_IN_SECOND : DEFAULT_FULL_PROCESSING_MS),
  };
}
