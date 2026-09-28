import { aiApiClient } from "../ai-client";
import { apiClient } from "../client";
import type {
  AssessmentResolveRequest,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  Evaluation,
  PaginatedErrorRecordsResponse,
  ReportsResponse,
  Scenario,
  ScenarioCreateRequest,
  ScenarioListQuery,
  ScenarioValidateRequest,
  Session,
  SessionAiReport,
  SessionControlRequest,
  SessionControlResponse,
  SessionCreateRequest,
  SessionErrorSummaryResponse,
  SessionFeedQuery,
  SessionFeedResponse,
  SessionListQuery,
  StudentErrorsResponse,
} from "../types";
import { API_PATHS } from "./paths";

export function listScenarios(query?: ScenarioListQuery, signal?: AbortSignal): Promise<Scenario[]> {
  return apiClient.get<Scenario[]>(API_PATHS.scenarios, query, signal);
}

export function createScenario(body: ScenarioCreateRequest): Promise<Scenario> {
  return apiClient.post<Scenario>(API_PATHS.scenarios, body);
}

export function validateScenario(scenarioId: string, body: ScenarioValidateRequest): Promise<Scenario> {
  return apiClient.post<Scenario>(API_PATHS.scenarioValidate(scenarioId), body);
}

export function listSessions(query?: SessionListQuery, signal?: AbortSignal): Promise<Session[]> {
  return apiClient.get<Session[]>(API_PATHS.sessions, query, signal);
}

export function createSession(body: SessionCreateRequest): Promise<Session> {
  return apiClient.post<Session>(API_PATHS.sessions, body);
}

/** POST /sessions/[id]/start — configured → running (иначе 409). */
export function startSession(sessionId: string): Promise<Session> {
  return apiClient.post<Session>(API_PATHS.sessionStart(sessionId));
}

/** POST /sessions/[id]/stop — → finished (доступно в любой момент идущего занятия). */
export function stopSession(sessionId: string): Promise<Session> {
  return apiClient.post<Session>(API_PATHS.sessionStop(sessionId));
}

/** GET /sessions/[id]/feed?since=&at= — события окна (since, at]; тики — на клиенте. */
export function getSessionFeed(
  sessionId: string,
  query?: SessionFeedQuery,
  signal?: AbortSignal,
): Promise<SessionFeedResponse> {
  return apiClient.get<SessionFeedResponse>(API_PATHS.sessionFeed(sessionId), query, signal);
}

/** GET /sessions/[id]/control — занятие, настройки мастера (SessionPlan) и состояние выдачи. */
export function getSessionControl(sessionId: string, signal?: AbortSignal): Promise<SessionControlResponse> {
  return apiClient.get<SessionControlResponse>(API_PATHS.sessionControl(sessionId), undefined, signal);
}

/**
 * POST /sessions/[id]/control — управление во время занятия: пауза/возобновление выдачи, внеочередная
 * карточка курсанту, перевод в `reported` после формирования отчёта.
 */
export function postSessionControl(
  sessionId: string,
  body: SessionControlRequest,
): Promise<SessionControlResponse> {
  return apiClient.post<SessionControlResponse>(API_PATHS.sessionControl(sessionId), body);
}

/** GET /reports?sessionId= — персональные отчёты + групповой. */
export function getReports(sessionId: string, signal?: AbortSignal): Promise<ReportsResponse> {
  return apiClient.get<ReportsResponse>(API_PATHS.reports, { sessionId }, signal);
}

/**
 * GET /reports?studentId= — отчёты курсанта по всем занятиям. Для обучающегося мок-слой берёт studentId из
 * сессии (cookie): чужой id → 403, групповой отчёт не отдаётся (T2.5-01).
 */
export function getStudentReports(studentId: string, signal?: AbortSignal): Promise<ReportsResponse> {
  return apiClient.get<ReportsResponse>(API_PATHS.reports, { studentId }, signal);
}

/** GET /attempts/[id]/evaluation — 404 evaluationPending, если оценки ещё нет. */
export function getAttemptEvaluation(attemptId: string, signal?: AbortSignal): Promise<Evaluation> {
  return apiClient.get<Evaluation>(API_PATHS.attemptEvaluation(attemptId), undefined, signal);
}

const attemptPath = (attemptId: string) => `/attempts/${encodeURIComponent(attemptId)}`;

/** GET /api/v1/ai/attempts/[id]/assessment-state — текущая ревизия, 4 оси и статус оценки. */
export function getAssessmentState(
  attemptId: string,
  signal?: AbortSignal,
): Promise<AssessmentStateResponse> {
  return aiApiClient.get<AssessmentStateResponse>(
    `${attemptPath(attemptId)}/assessment-state`,
    undefined,
    signal,
  );
}

/** GET /api/v1/ai/attempts/[id]/review — данные для арбитража преподавателем спорной семантики (403 для курсанта). */
export function getAssessmentReview(
  attemptId: string,
  signal?: AbortSignal,
): Promise<AssessmentReviewResponse> {
  return aiApiClient.get<AssessmentReviewResponse>(`${attemptPath(attemptId)}/review`, undefined, signal);
}

/** POST /api/v1/ai/attempts/[id]/resolve — разрешение спора преподавателем (TeacherOverride + CalibrationSample). */
export function resolveAssessment(
  attemptId: string,
  body: AssessmentResolveRequest,
): Promise<{ status: string; revision: number; totalScore: number }> {
  return aiApiClient.post<{ status: string; revision: number; totalScore: number }>(
    `${attemptPath(attemptId)}/resolve`,
    body,
  );
}

/** GET /api/v1/ai/sessions/[id]/errors — постраничный реестр ErrorRecord сессии. */
export function getSessionErrors(
  sessionId: string,
  params?: { studentId?: string; detector?: string; severity?: string; page?: number; pageSize?: number },
  signal?: AbortSignal,
): Promise<PaginatedErrorRecordsResponse> {
  return aiApiClient.get<PaginatedErrorRecordsResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/errors`,
    params,
    signal,
  );
}

/** GET /api/v1/ai/sessions/[id]/error-summary — агрегированная сводка ошибок по осям. */
export function getSessionErrorSummary(
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionErrorSummaryResponse> {
  return aiApiClient.get<SessionErrorSummaryResponse>(
    `/sessions/${encodeURIComponent(sessionId)}/error-summary`,
    undefined,
    signal,
  );
}

/** GET /api/v1/ai/me/errors — доказанные ошибки текущего курсанта с группировкой по попыткам. */
export function getMyErrors(sessionId?: string, signal?: AbortSignal): Promise<StudentErrorsResponse> {
  return aiApiClient.get<StudentErrorsResponse>("/me/errors", sessionId ? { sessionId } : undefined, signal);
}

/** GET /api/v1/ai/sessions/[id]/report — воспроизводимый агрегированный отчёт сессии. */
export function getSessionAiReport(sessionId: string, signal?: AbortSignal): Promise<SessionAiReport> {
  return aiApiClient.get<SessionAiReport>(
    `/sessions/${encodeURIComponent(sessionId)}/report`,
    undefined,
    signal,
  );
}
