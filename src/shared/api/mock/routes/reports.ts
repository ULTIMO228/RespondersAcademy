/*
 * Route handlers отчётов (логика — ../reports.ts, ../reports-journal.ts, ../reports-teacher.ts):
 * GET /reports, GET /reports/journal, POST /reports/feedback, GET и POST /attempts/[id]/evaluation.
 */
import { getAttemptEvaluationById, getReports } from "../reports";
import type { AttemptEvaluator } from "../reports";
import { getReportJournal } from "../reports-journal";
import type { RuntimeReportDeps } from "../reports-runtime";
import { overrideAttemptEvaluation, saveReportFeedback } from "../reports-teacher";
import { readSearchParams } from "../request";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";
import type { ViewerResolver } from "../viewer";

const NO_VIEWER: ViewerResolver = () => null;

/**
 * GET /reports; пользователя запроса (мок-сессию) и сборку отчёта по рантайм-данным занятия
 * (доменная оценка попытки живёт в entities/report) передаёт серверная сборка app/api/mock/_server.
 */
export function createGetReportsHandler(
  resolveViewer: ViewerResolver = NO_VIEWER,
  deps: RuntimeReportDeps | null = null,
) {
  return withErrorHandling(async (request: Request) =>
    jsonOk(await getReports(readSearchParams(request), resolveViewer(request), deps)),
  );
}

/** GET /reports/journal — журнал занятий преподавателя с фильтрами (T3.4-02, T3.4-03). */
export function createGetReportJournalHandler(
  resolveViewer: ViewerResolver = NO_VIEWER,
  deps: RuntimeReportDeps | null = null,
) {
  return withErrorHandling(async (request: Request) =>
    jsonOk(await getReportJournal(readSearchParams(request), resolveViewer(request), deps)),
  );
}

/** POST /reports/feedback — обратная связь курсанту (T3.4-10). */
export function createPostReportFeedbackHandler(resolveViewer: ViewerResolver = NO_VIEWER) {
  return withErrorHandling(async (request: Request) =>
    jsonCreated(await saveReportFeedback(request, resolveViewer(request))),
  );
}

/** GET /attempts/[id]/evaluation; оценщик (ИИ-шлюз) и резолвер мок-сессии передаёт серверная сборка. */
export function createGetAttemptEvaluationHandler(
  evaluate: AttemptEvaluator,
  resolveViewer: ViewerResolver = NO_VIEWER,
) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) =>
    jsonOk(await getAttemptEvaluationById((await params).id, evaluate, resolveViewer(request))),
  );
}

/** POST /attempts/[id]/evaluation — правка оценки преподавателем с записью в аудит (T3.4-09). */
export function createPostAttemptEvaluationHandler(
  evaluate: AttemptEvaluator,
  resolveViewer: ViewerResolver = NO_VIEWER,
) {
  return withErrorHandling(async (request: Request, { params }: RouteContext) =>
    jsonOk(await overrideAttemptEvaluation((await params).id, request, evaluate, resolveViewer(request))),
  );
}
