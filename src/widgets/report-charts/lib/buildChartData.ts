import type { ReportContract } from "@/shared/api";

import {
  ERROR_COLUMNS,
  HEAT_LEVEL_MAX,
  PROCESSING_STAGE_INDEX,
  REACTION_STAGE_INDEX,
} from "../config/charts";

const MS_IN_SECOND = 1000;

export type StageSeries = {
  labels: string[];
  reactionSec: number[];
  processingSec: number[];
  reactionNormSec: number;
  processingNormSec: number;
};

export type HeatRow = {
  id: string;
  label: string;
  cells: { key: string; value: number; level: number }[];
};

function toSec(valueMs: number): number {
  return Math.round(valueMs / MS_IN_SECOND);
}

export function getHeatLevel(value: number): number {
  return Math.min(Math.max(value, 0), HEAT_LEVEL_MAX);
}

/** byStage: реакция и полная отработка по каждой попытке всех курсантов (из Report.charts.byStage). */
export function buildStageSeries(reports: ReportContract[]): StageSeries {
  const attempts = reports.flatMap((report) =>
    report.charts.byStage.attempts.map((attempt) => ({
      ...attempt,
      name: report.student.fullName.split(" ")[0],
    })),
  );
  const normMs = reports[0]?.charts.byStage.normMs ?? [];
  return {
    labels: attempts.map((attempt) => `${attempt.attemptId} ${attempt.name}`),
    reactionSec: attempts.map((attempt) => toSec(attempt.factMs[REACTION_STAGE_INDEX])),
    processingSec: attempts.map((attempt) => toSec(attempt.factMs[PROCESSING_STAGE_INDEX])),
    reactionNormSec: toSec(normMs[REACTION_STAGE_INDEX] ?? 0),
    processingNormSec: toSec(normMs[PROCESSING_STAGE_INDEX] ?? 0),
  };
}

/** byErrorType: курсант × тип ошибки (грамматика spelling/syntax + ошибки по severity). */
export function buildHeatRows(reports: ReportContract[]): HeatRow[] {
  return reports.map((report) => {
    const { grammar, errors } = report.charts.byErrorType;
    const counts: Record<string, number> = { ...grammar, ...errors };
    return {
      id: report.id,
      label: report.student.fullName,
      cells: ERROR_COLUMNS.map((column) => ({
        key: column.key,
        value: counts[column.key] ?? 0,
        level: getHeatLevel(counts[column.key] ?? 0),
      })),
    };
  });
}

/**
 * dynamics (bar): интегральный балл по курсантам. Источник — тот же `Report.score`, что и в сводной
 * таблице отчёта, поэтому столбцы и таблица не расходятся (объективность диаграмм, ТЗ §17).
 */
export function buildScoreByStudent(reports: ReportContract[]): { labels: string[]; values: number[] } {
  return {
    labels: reports.map((report) => report.student.fullName.split(" ")[0]),
    values: reports.map((report) => report.score),
  };
}

/** Есть ли в тепловой карте хотя бы одна ошибка; иначе показывается честное пустое состояние. */
export function hasAnyError(rows: HeatRow[]): boolean {
  return rows.some((row) => row.cells.some((cell) => cell.value > 0));
}

/** dynamics: баллы попыток по порядку + средний балл занятия (для линии). */
export function buildDynamics(reports: ReportContract[]) {
  const labels = reports.flatMap((report) => report.charts.dynamics.labels);
  const scores = reports.flatMap((report) => report.charts.dynamics.scores);
  const average =
    scores.length > 0 ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  return { labels, scores, averageLine: scores.map(() => average), average };
}
