/*
 * Route handlers автономного режима ИИ-панелей (app/api/v1/ai/**). Фабрики принимают резолвер пользователя и
 * оценщик попытки — их передаёт серверная сборка app/api/v1/_server (shared не импортирует entities).
 */
import {
  getAssessmentReviewFor,
  getAssessmentStateFor,
  getMyErrorsFor,
  getSessionErrorsFor,
  getSessionErrorSummaryFor,
  resolveAssessmentFor,
} from "../ai-assessment";
import {
  approveAiScenario,
  createAiScenarioDrafts,
  listAiScenarioVersionsFor,
  reviseAiScenario,
} from "../ai-scenarios";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";
import type { AttemptEvaluator } from "../reports";
import type { ViewerResolver } from "../viewer";

/** Динамический сегмент AI-роутов: [id] — id сценария, попытки или занятия. */
type Context = RouteContext<{ id: string }>;

export function createAiHandlers(evaluate: AttemptEvaluator, resolveViewer: ViewerResolver) {
  return {
    postScenarioDrafts: withErrorHandling(async (request: Request) =>
      jsonCreated(await createAiScenarioDrafts(request, resolveViewer(request))),
    ),
    postScenarioRevise: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonCreated(await reviseAiScenario((await params).id, request, resolveViewer(request))),
    ),
    postScenarioApprove: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await approveAiScenario((await params).id, request, resolveViewer(request))),
    ),
    getScenarioVersions: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(listAiScenarioVersionsFor((await params).id, resolveViewer(request))),
    ),
    getAssessmentState: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await getAssessmentStateFor((await params).id, evaluate, resolveViewer(request))),
    ),
    getAssessmentReview: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await getAssessmentReviewFor((await params).id, evaluate, resolveViewer(request))),
    ),
    postAssessmentResolve: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await resolveAssessmentFor((await params).id, request, evaluate, resolveViewer(request))),
    ),
    getSessionErrors: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await getSessionErrorsFor((await params).id, request, evaluate, resolveViewer(request))),
    ),
    getSessionErrorSummary: withErrorHandling(async (request: Request, { params }: Context) =>
      jsonOk(await getSessionErrorSummaryFor((await params).id, evaluate, resolveViewer(request))),
    ),
    getMyErrors: withErrorHandling(async (request: Request) =>
      jsonOk(await getMyErrorsFor(request, evaluate, resolveViewer(request))),
    ),
  };
}
