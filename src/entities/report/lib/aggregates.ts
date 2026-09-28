/*
 * Сводка прогресса курсанта (T2.5-02; spec/000-фронт/04-pages/04-arm-progress.md «Сводка»): интегральный балл за период,
 * средние реакция/отработка (сравниваются с нормативами сценария), число отработанных карточек, доля без ошибок.
 * Расчёт — из попыток (CardEvent/Evaluation) и отчётов (Report.score) мок-слоя; баллы не пересчитываются.
 */
import type { ProgressNorms, ProgressSummaryData } from "../model/attempt";

export type AttemptMetrics = {
  openedAt: string;
  primaryReactionMs: number;
  fullProcessingMs: number;
  /** Балл попытки (правка преподавателя приоритетна) — запасной источник интегрального балла. */
  score: number | null;
  mistakeCount: number;
};

const PERCENT = 100;

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundOrNull(value: number | null): number | null {
  return value === null ? null : Math.round(value);
}

/** Интегральный балл: среднее Report.score за период; нет отчётов (занятие не закрыто) — среднее баллов попыток. */
function getIntegralScore(reportScores: number[], attempts: AttemptMetrics[]): number | null {
  const scores =
    reportScores.length > 0
      ? reportScores
      : attempts.map((attempt) => attempt.score).filter((score): score is number => score !== null);
  return roundOrNull(average(scores));
}

/** Попытки — в хронологическом порядке (openedAt), период — от первой до последней. */
export function summarizeProgress(
  attempts: AttemptMetrics[],
  reportScores: number[],
  norms: ProgressNorms,
): ProgressSummaryData {
  const errorFreeCount = attempts.filter((attempt) => attempt.mistakeCount === 0).length;
  return {
    periodFrom: attempts[0]?.openedAt ?? null,
    periodTo: attempts[attempts.length - 1]?.openedAt ?? null,
    integralScore: getIntegralScore(reportScores, attempts),
    averageReactionMs: roundOrNull(average(attempts.map((attempt) => attempt.primaryReactionMs))),
    averageProcessingMs: roundOrNull(average(attempts.map((attempt) => attempt.fullProcessingMs))),
    cardCount: attempts.length,
    errorFreePercent: attempts.length > 0 ? Math.round((errorFreeCount / attempts.length) * PERCENT) : null,
    norms,
  };
}
