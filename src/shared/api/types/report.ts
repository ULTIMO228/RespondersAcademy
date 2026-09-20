/*
 * Отчёты — spec/05-data-models.md §8 (mocks/reports.json).
 * Графики типизированы по факту мока (в спеке — unknown). aiComment/groupInsights — ИИ-происхождение (бейдж «ИИ» в UI).
 */
import type { CardSource, ErrorSeverity, GrammarErrorType, ScenarioMode } from "./session";

export type ReportExportFormat = "csv" | "pdf";

export interface ReportStudent {
  studentId: string;
  fullName: string;
  armNumber: number;
}

export interface ReportTimeMetric {
  cardId: string;
  stage: string;
  normMs: number;
  factMs: number;
  deviationMs: number;
}

export interface ReportGrammarError {
  cardId: string;
  field: string;
  fragment: string;
  wrong: string;
  expected: string;
  type: GrammarErrorType;
}

export interface ReportError {
  cardId: string;
  type: string;
  severity: ErrorSeverity;
  message: string;
}

export interface ReportStageAttempt {
  attemptId: string;
  cardId: string;
  factMs: number[];
}

export interface ReportCharts {
  byStage: { stages: string[]; normMs: number[]; attempts: ReportStageAttempt[] };
  byErrorType: { grammar: Record<GrammarErrorType, number>; errors: Record<ErrorSeverity, number> };
  dynamics: { labels: string[]; scores: number[] };
}

/** Обратная связь преподавателя курсанту (spec/04-pages/13 п. 5) — видна в `/arm/progress`. */
export interface ReportFeedback {
  reportId: string;
  sessionId: string;
  studentId: string;
  text: string;
  recommendations: string[];
  at: string;
  /** id преподавателя. */
  by: string;
  byName: string;
}

export interface ReportFeedbackRequest {
  reportId: string;
  teacherId: string;
  text: string;
  recommendations?: string[];
}

/** Экспертная оценка преподавателя: приоритет над оценкой ИИ (Q&A в3), пишется в аудит (ТЗ §8). */
export interface EvaluationOverrideRequest {
  teacherId: string;
  score: number;
  comment: string;
}

export interface Report {
  id: string;
  sessionId: string;
  generatedAt: string;
  exportFormats: ReportExportFormat[];
  student: ReportStudent;
  timeMetrics: ReportTimeMetric[];
  grammarErrors: ReportGrammarError[];
  errors: ReportError[];
  score: number;
  charts: ReportCharts;
  /** ИИ-разбор (мок). */
  aiComment?: string;
  /** Обратная связь преподавателя (мок-стор, T3.4-10); в reports.json её нет. */
  teacherFeedback?: ReportFeedback;
}

export type ReportJournalStatus = "ready" | "draft";

export interface ReportJournalStudent {
  id: string;
  fullName: string;
}

/** Строка журнала отчётов `/teacher/reports` (spec/04-pages/13 → «Журнал отчётов»). */
export interface ReportJournalRow {
  sessionId: string;
  teacherId: string;
  teacherName: string;
  startedAt: string;
  finishedAt: string | null;
  groups: string[];
  categories: string[];
  students: ReportJournalStudent[];
  averageScore: number | null;
  status: ReportJournalStatus;
  mode: ScenarioMode;
  cardSource: CardSource;
  generatedAt: string | null;
  /** ТЗ §7: формирование отчёта ≤ 30 сек — `generatedAt` минус завершение занятия. */
  buildSec: number | null;
}

/** Значения фильтров журнала — из данных преподавателя, без хардкода в UI. */
export interface ReportJournalFilters {
  groups: string[];
  students: ReportJournalStudent[];
  categories: string[];
}

export interface ReportJournalResponse {
  rows: ReportJournalRow[];
  filters: ReportJournalFilters;
}

export type ReportJournalQuery = {
  teacherId?: string;
  studentId?: string;
  group?: string;
  category?: string;
  /** Период по дате занятия, границы включительно (YYYY-MM-DD). */
  from?: string;
  to?: string;
};

export type ChartKind = "bar" | "line" | "heatmap" | "table";

export interface ChartData<TSeries = unknown> {
  kind: ChartKind;
  title: string;
  series: TSeries;
}

export interface LabeledSeries {
  labels: string[];
  values: number[];
}

export interface GroupReportCharts {
  scoreByStudent: ChartData<LabeledSeries>;
  reactionByAttempt: ChartData<LabeledSeries & { norm: number }>;
  errorsByCriterion: ChartData<{ criteria: string[]; errors: number[] }>;
}

export interface GroupReport {
  id: string;
  sessionId: string;
  generatedAt: string;
  /** По спеке обязателен; в mocks/reports.json отсутствует — вычисляется мок-слоем при отдаче. */
  reportIds?: string[];
  /** Инсайты ИИ (мок). */
  groupInsights: string[];
  charts: GroupReportCharts;
}
