/** Новые операции версионируемого сценарного workflow `/api/v1/ai`. */

import { aiApiClient } from "../ai-client";
import type {
  AIScenarioApproveRequest,
  AIScenarioDraftRequest,
  AIScenarioReviseRequest,
  AIScenarioVersion,
} from "../types";

const scenarioPath = (scenarioId: string) => `/scenarios/${encodeURIComponent(scenarioId)}`;

export function createAIScenarioDrafts(body: AIScenarioDraftRequest): Promise<AIScenarioVersion[]> {
  return aiApiClient.post<AIScenarioVersion[]>("/scenarios/drafts", body);
}

export function reviseAIScenario(
  scenarioId: string,
  body: AIScenarioReviseRequest,
): Promise<AIScenarioVersion> {
  return aiApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/revise`, body);
}

export function approveAIScenario(
  scenarioId: string,
  body: AIScenarioApproveRequest,
): Promise<AIScenarioVersion> {
  return aiApiClient.post<AIScenarioVersion>(`${scenarioPath(scenarioId)}/approve`, body);
}

export function listAIScenarioVersions(
  scenarioId: string,
  signal?: AbortSignal,
): Promise<AIScenarioVersion[]> {
  return aiApiClient.get<AIScenarioVersion[]>(`${scenarioPath(scenarioId)}/versions`, undefined, signal);
}
