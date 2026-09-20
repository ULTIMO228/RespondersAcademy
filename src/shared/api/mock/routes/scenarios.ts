/* Route handlers /api/mock/scenarios* (логика — ../scenarios.ts). */
import type { AiGateway } from "../../ai-gateway";
import { readSearchParams } from "../request";
import type { RouteContext } from "../request";
import { jsonCreated, jsonOk, withErrorHandling } from "../respond";
import {
  createScenario,
  deleteScenario,
  generateScenarios,
  getScenario,
  listScenarios,
  updateScenario,
  validateScenario,
} from "../scenarios";

export const handleGetScenarios = withErrorHandling((request: Request) =>
  jsonOk(listScenarios(readSearchParams(request))),
);

export const handlePostScenario = withErrorHandling(async (request: Request) =>
  jsonCreated(await createScenario(request)),
);

export const handleGetScenario = withErrorHandling(async (_request: Request, { params }: RouteContext) =>
  jsonOk(getScenario((await params).id)),
);

export const handlePatchScenario = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonOk(await updateScenario((await params).id, request)),
);

export const handleDeleteScenario = withErrorHandling(async (request: Request, { params }: RouteContext) =>
  jsonOk(await deleteScenario((await params).id, request)),
);

export const handlePostScenarioValidate = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await validateScenario((await params).id, request)),
);

/**
 * POST /scenarios/generate — генерация вариаций через ИИ-шлюз. Шлюз передаётся параметром: логика
 * мок-слоя не знает, мок это или реальный сервис (ИИ-модуль: заменить на реальный сервис).
 */
export function createPostScenarioGenerateHandler(getGateway: () => AiGateway) {
  return withErrorHandling(async (request: Request) =>
    jsonCreated(await generateScenarios(getGateway(), request)),
  );
}
