/** Граф сценария 112 (спека 005): /api/v1/ai/scenarios* — только с бэкендом (requiresServer). */

import { v1ApiClient } from "../v1-client";
import type {
  AIScenarioListItem,
  AIScenarioListQuery,
  AIScenarioVersion,
  AssignedScenario,
  GraphValidationResult,
  ScenarioGraph,
  ScenarioGraphCreateRequest,
  ScenarioActionRequest,
  ScenarioDeriveRequest,
  ScenarioGraphReviseRequest,
  ScenarioPermissionsResponse,
  ScenarioPublishRequest,
  ScenarioReviewRequest,
  ScenarioRunListItem,
  ScenarioRunView,
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

export function deriveGraphScenarioVersion(
  scenarioId: string,
  version: number,
  body: ScenarioDeriveRequest,
): Promise<AIScenarioVersion> {
  return v1ApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/versions/${version}/derive`, body);
}

const runPath = (runId: string) => `/ai/scenario-runs/${encodeURIComponent(runId)}`;

export function listAssignedScenarios(signal?: AbortSignal): Promise<AssignedScenario[]> {
  return v1ApiClient.get<AssignedScenario[]>("/ai/scenario-assignments", undefined, signal);
}

/** 201 — новый прогон, 200 — вернулся активный (клиент различия не делает: вид один). */
export function startScenarioRun(
  scenarioId: string,
  version: number,
  signal?: AbortSignal,
): Promise<ScenarioRunView> {
  return v1ApiClient.post<ScenarioRunView>(
    `${scenarioPath(scenarioId)}/versions/${version}/runs`,
    undefined,
    signal,
  );
}

export function getScenarioRun(runId: string, signal?: AbortSignal): Promise<ScenarioRunView> {
  return v1ApiClient.get<ScenarioRunView>(runPath(runId), undefined, signal);
}

export function performScenarioAction(runId: string, body: ScenarioActionRequest): Promise<ScenarioRunView> {
  return v1ApiClient.post<ScenarioRunView>(`${runPath(runId)}/actions`, body);
}

export function finishScenarioRun(runId: string): Promise<ScenarioRunView> {
  return v1ApiClient.post<ScenarioRunView>(`${runPath(runId)}/finish`);
}

export function listScenarioRuns(
  query: { scenarioId: string },
  signal?: AbortSignal,
): Promise<ScenarioRunListItem[]> {
  return v1ApiClient.get<ScenarioRunListItem[]>("/ai/scenario-runs", { ...query }, signal);
}
