/*
 * Клиент отчётов преподавателя (T3.4-01): журнал занятий, правка оценки, обратная связь курсанту.
 * Персональные отчёты и оценка попытки — getReports / getStudentReports / getAttemptEvaluation (./training).
 */
import { apiClient } from "../client";
import { v1ApiClient } from "../v1-client";
import type {
  Evaluation,
  EvaluationOverrideRequest,
  ReportFeedback,
  ReportFeedbackRequest,
  ReportJournalQuery,
  ReportExportFormat,
  ReportJournalResponse,
} from "../types";
import { API_PATHS } from "./paths";

/** GET /reports/journal — прошедшие занятия преподавателя + значения фильтров (период/группа/курсант/категория). */
export function getReportJournal(
  query?: ReportJournalQuery,
  signal?: AbortSignal,
): Promise<ReportJournalResponse> {
  return apiClient.get<ReportJournalResponse>(API_PATHS.reportJournal, query, signal);
}

/** POST /attempts/[id]/evaluation — экспертная оценка преподавателя (приоритет над ИИ) с записью в аудит. */
export function postAttemptEvaluation(
  attemptId: string,
  body: EvaluationOverrideRequest,
): Promise<Evaluation> {
  return apiClient.post<Evaluation>(API_PATHS.attemptEvaluation(attemptId), body);
}

/** POST /reports/feedback — комментарий и рекомендации курсанту (видны в `/arm/progress`). */
export function postReportFeedback(body: ReportFeedbackRequest): Promise<ReportFeedback> {
  return apiClient.post<ReportFeedback>(API_PATHS.reportFeedback, body);
}

/**
 * GET /api/v1/reports/{id}/export.csv|pdf: id — из GET /reports (индивидуальный) либо групповой отчёт занятия.
 * Сервер отдаёт attachment (CSV с BOM, PDF); студент — только свой, преподаватель — своих занятий (иначе 403).
 */
export function downloadReportExport(reportId: string, format: ReportExportFormat): Promise<Blob> {
  return v1ApiClient.getBlob(`/reports/${encodeURIComponent(reportId)}/export.${format}`);
}
