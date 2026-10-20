/** Сводная успеваемость (спека 005): `GET /api/v1/performance/report`, формы — `spec/005-performance-report/data-model.md`. */

export type PerformanceMode = "all" | "dds" | "operator112";
export type PerformancePeriod = "2w" | "1m" | "all" | "range";
export type PerformanceLevel = "ok" | "risk" | "noData";

export interface PerformanceFilters {
  mode: PerformanceMode;
  period: PerformancePeriod;
  /** Только при `period: "range"`, ГГГГ-ММ-ДД. */
  from?: string;
  to?: string;
  groupId?: string;
}

export interface PerformanceStats {
  students: number;
  activeStudents: number;
  attempts: number;
  /** null — попыток меньше минимума: число не выдумывается. */
  avgScore: number | null;
  previousAvgScore: number | null;
  delta: number | null;
  /** Доля 0…1. */
  reactionInNormShare: number | null;
  processingInNormShare: number | null;
  exams: number;
  examsPassed: number;
  weakStage: string | null;
  level: PerformanceLevel;
}

export interface PerformanceGroupRow {
  groupId: string;
  title: string;
  stats: PerformanceStats;
}

export interface PerformanceStudentRow {
  studentId: string;
  name: string;
  groupId: string | null;
  stats: PerformanceStats;
}

export interface PerformanceError {
  label: string;
  attempts: number;
}

export interface PerformanceReport {
  filters: PerformanceFilters;
  generatedAt: string;
  thresholds: { minAttemptsStudent: number; minAttemptsGroup: number; riskScore: number };
  totals: PerformanceStats;
  groups: PerformanceGroupRow[];
  students: PerformanceStudentRow[];
  topErrors: PerformanceError[];
}
