/** Граф сценария 112 (спека 005): /api/v1/ai/scenarios* — только с бэкендом (requiresServer). */

import { v1ApiClient } from "../v1-client";
import type {
  AIScenarioListItem,
  AIScenarioListQuery,
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
} from "../types";

const scenarioPath = (scenarioId: string) => `/ai/scenarios/${encodeURIComponent(scenarioId)}`;

export function getScenarioPermissions(signal?: AbortSignal): Promise<ScenarioPermissionsResponse> {
  return v1ApiClient.get<ScenarioPermissionsResponse>("/ai/scenarios/permissions", undefined, signal);
}

export function listScenarioSources(signal?: AbortSignal): Promise<ScenarioSourceItem[]> {
  return v1ApiClient.get<ScenarioSourceItem[]>("/ai/scenarios/sources", undefined, signal);
}

export function validateScenarioGraph(
  graph: ScenarioGraph,
  signal?: AbortSignal,
): Promise<GraphValidationResult> {
  return v1ApiClient.post<GraphValidationResult>("/ai/scenarios/graph/validate", { graph }, signal);
}

export function listGraphScenarios(
  query: AIScenarioListQuery = {},
  signal?: AbortSignal,
): Promise<AIScenarioListItem[]> {
  return v1ApiClient.get<AIScenarioListItem[]>("/ai/scenarios", { ...query }, signal);
}

export function listGraphScenarioVersions(
  scenarioId: string,
  signal?: AbortSignal,
): Promise<AIScenarioVersion[]> {
  return v1ApiClient.get<AIScenarioVersion[]>(`${scenarioPath(scenarioId)}/versions`, undefined, signal);
}

export function getGraphScenarioVersion(
  scenarioId: string,
  version: number,
  signal?: AbortSignal,
): Promise<AIScenarioVersion> {
  return v1ApiClient.get<AIScenarioVersion>(
    `${scenarioPath(scenarioId)}/versions/${version}`,
    undefined,
    signal,
  );
}

export function createGraphScenario(body: ScenarioGraphCreateRequest): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>("/ai/scenarios", body);
}

export function reviseGraphScenario(
  scenarioId: string,
  body: ScenarioGraphReviseRequest,
): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/revise`, body);
}

export function submitGraphScenario(
  scenarioId: string,
  body: ScenarioSubmitRequest,
): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/submit`, body);
}

export function reviewGraphScenario(
  scenarioId: string,
  body: ScenarioReviewRequest,
): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/review`, body);
}

export function publishGraphScenario(
  scenarioId: string,
  body: ScenarioPublishRequest,
): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/publish`, body);
}
