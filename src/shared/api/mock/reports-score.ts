/*
 * Пересчёт балла отчёта по попыткам занятия (T3.4-09; ТЗ §17 «проверка расчётов»).
 * Источник один: Evaluation попыток занятия. Правка преподавателя (teacherOverride) приоритетна над
 * оценкой ИИ (Q&A в3), поэтому после правки меняются и балл курсанта, и точки графика dynamics.
 */
import type { CardEvent, Report, Session } from "../types";

/** Балл попытки с приоритетом преподавателя; попытка без оценки в расчёт не идёт. */
export function getEffectiveAttemptScore(attempt: CardEvent): number | null {
  const { evaluation } = attempt;
  if (!evaluation) return null;
  return evaluation.teacherOverride?.score ?? evaluation.totalScore;
}

function averageScore(scores: number[]): number {
  return Math.floor(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

/**
 * Балл отчёта курсанта = среднее по его попыткам занятия (правило мока reports.json: 98 и 95 → 96).
 * Нет ни одной оценённой попытки — отчёт отдаётся как есть.
 */
export function recomputeReportScore(report: Report, session: Session | undefined): Report {
  const attempts = (session?.cardEvents ?? []).filter(
    (attempt) => attempt.studentId === report.student.studentId,
  );
  const scored = attempts.flatMap((attempt) => {
    const score = getEffectiveAttemptScore(attempt);
    return score === null ? [] : [{ attemptId: attempt.id, score }];
  });
  if (scored.length === 0) return report;
  return {
    ...report,
    score: averageScore(scored.map((item) => item.score)),
    charts: {
      ...report.charts,
      dynamics: {
        labels: scored.map((item) => item.attemptId),
        scores: scored.map((item) => item.score),
      },
    },
  };
}
