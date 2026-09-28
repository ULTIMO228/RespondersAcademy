/*
 * Клиент данных отчёта о занятии (T3.4-01…10): всё через @/shared/api, в тестах подменяется целиком.
 * Источники: GET /reports?sessionId= (персональные + групповой), GET /reports/journal?  (шапка занятия),
 * GET /sessions (попытки занятия), GET /attempts/[id]/evaluation (оценка с правкой преподавателя),
 * GET /reference (названия статусов ДДС), GET /cards/[id] (№ и тип карточки),
 * POST /attempts/[id]/evaluation и POST /reports/feedback (действия преподавателя).
 */
import {
  getAttemptEvaluation,
  getCard,
  getReference,
  getReportJournal,
  getReports,
  getSessionErrorSummary,
  listSessions,
  postAttemptEvaluation,
  postReportFeedback,
} from "@/shared/api";
import type {
  CardDetails,
  Evaluation,
  EvaluationOverrideRequest,
  ReferenceData,
  ReportFeedback,
  ReportFeedbackRequest,
  ReportJournalQuery,
  ReportJournalResponse,
  ReportsResponse,
  SessionContract,
  SessionErrorSummaryResponse,
  SessionListQuery,
} from "@/shared/api";

export type ReportApi = {
  getReports: (sessionId: string, signal?: AbortSignal) => Promise<ReportsResponse>;
  getReportJournal: (query?: ReportJournalQuery, signal?: AbortSignal) => Promise<ReportJournalResponse>;
  listSessions: (query?: SessionListQuery, signal?: AbortSignal) => Promise<SessionContract[]>;
  getAttemptEvaluation: (attemptId: string, signal?: AbortSignal) => Promise<Evaluation>;
  getReference: (signal?: AbortSignal) => Promise<ReferenceData>;
  getCard: (cardId: string, signal?: AbortSignal) => Promise<CardDetails>;
  postAttemptEvaluation: (attemptId: string, body: EvaluationOverrideRequest) => Promise<Evaluation>;
  postReportFeedback: (body: ReportFeedbackRequest) => Promise<ReportFeedback>;
  getSessionErrorSummary?: (sessionId: string, signal?: AbortSignal) => Promise<SessionErrorSummaryResponse>;
};

export const defaultReportApi: ReportApi = {
  getReports,
  getReportJournal,
  listSessions,
  getAttemptEvaluation,
  getReference,
  getCard,
  postAttemptEvaluation,
  postReportFeedback,
  getSessionErrorSummary,
};
