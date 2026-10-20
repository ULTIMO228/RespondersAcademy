/* Зависимости редактора графа от сети: тип для инъекции в тестах и реализация поверх shared/api. */
import {
  createGraphScenario,
  getScenarioPermissions,
  listAIScenarioVersions,
  listScenarioSources,
  publishGraphScenario,
  reviewGraphScenario,
  reviseGraphScenario,
  submitGraphScenario,
  validateScenarioGraph,
} from "@/shared/api";
import type {
  AIScenarioVersion,
  GraphValidationResult,
  ScenarioGraph,
  ScenarioGraphCreateRequest,
  ScenarioGraphReviseRequest,
  ScenarioPermissionsResponse,
  ScenarioPublishRequest,
  ScenarioReviewRequest,
  ScenarioSourceItem,
  ScenarioSubmitRequest,
} from "@/shared/api";

export type ScenarioGraphEditorApi = {
  listAIScenarioVersions: (scenarioId: string, signal?: AbortSignal) => Promise<AIScenarioVersion[]>;
  getScenarioPermissions: (signal?: AbortSignal) => Promise<ScenarioPermissionsResponse>;
  listScenarioSources: (signal?: AbortSignal) => Promise<ScenarioSourceItem[]>;
  validateScenarioGraph: (graph: ScenarioGraph, signal?: AbortSignal) => Promise<GraphValidationResult>;
  createGraphScenario: (body: ScenarioGraphCreateRequest) => Promise<AIScenarioVersion>;
  reviseGraphScenario: (scenarioId: string, body: ScenarioGraphReviseRequest) => Promise<AIScenarioVersion>;
  submitGraphScenario: (scenarioId: string, body: ScenarioSubmitRequest) => Promise<AIScenarioVersion>;
  reviewGraphScenario: (scenarioId: string, body: ScenarioReviewRequest) => Promise<AIScenarioVersion>;
  publishGraphScenario: (scenarioId: string, body: ScenarioPublishRequest) => Promise<AIScenarioVersion>;
};

export const defaultScenarioGraphEditorApi: ScenarioGraphEditorApi = {
  listAIScenarioVersions,
  getScenarioPermissions,
  listScenarioSources,
  validateScenarioGraph,
  createGraphScenario,
  reviseGraphScenario,
  submitGraphScenario,
  reviewGraphScenario,
  publishGraphScenario,
};
