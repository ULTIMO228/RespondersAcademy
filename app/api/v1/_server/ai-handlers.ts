/*
 * Автономные ответы ИИ-панелей преподавателя (фича 002, T006): route handlers /api/v1/ai/**, работающие, когда фронт собран
 * без BACKEND_URL. При заданном BACKEND_URL rewrite `beforeFiles` из next.config.ts перекрывает эти файлы и запрос идёт на
 * бэкенд. Оценщик попытки и разбор мок-сессии — те же, что у /api/mock (app/api/mock/_server). Только пути, которые вызывают
 * AIScenarioWorkflowPanel, AIAssessmentPanel и SessionErrorSummaryPanel (+ история ошибок обучающегося).
 * Остальные /api/v1/* без бэкенда не обслуживаются: клиент превращает их 404 в ServerRequiredError.
 */
import { createAiHandlers } from "@/shared/api/mock/routes";

import { getServerAiGateway } from "../../mock/_server/ai-gateway";
import { readRequestViewer } from "../../mock/_server/viewer";

const handlers = createAiHandlers(
  async (attemptId) => (await getServerAiGateway().evaluateAttempt(attemptId)).data,
  readRequestViewer,
);

export const handlePostAiScenarioDrafts = handlers.postScenarioDrafts;
export const handlePostAiScenarioRevise = handlers.postScenarioRevise;
export const handlePostAiScenarioApprove = handlers.postScenarioApprove;
export const handleGetAiScenarioVersions = handlers.getScenarioVersions;
export const handleGetAiAssessmentState = handlers.getAssessmentState;
export const handleGetAiAssessmentReview = handlers.getAssessmentReview;
export const handlePostAiAssessmentResolve = handlers.postAssessmentResolve;
export const handleGetAiSessionErrors = handlers.getSessionErrors;
export const handleGetAiSessionErrorSummary = handlers.getSessionErrorSummary;
export const handleGetAiMyErrors = handlers.getMyErrors;
