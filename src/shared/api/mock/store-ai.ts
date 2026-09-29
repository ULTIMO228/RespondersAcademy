/*
 * Store автономного режима ИИ-панелей (app/api/v1/ai/**): версии AI-сценариев и кэш ответов по requestId.
 * Отдаёт копии; правила доступа и валидация — в ai-scenarios.ts.
 */
import type { AIScenarioVersion } from "../types";
import { cloneOut, getMockState, MOCK_ID_PREFIX, nextMockId } from "./store";

export function nextAiScenarioId(): string {
  return nextMockId(MOCK_ID_PREFIX.aiScenario);
}

/** Версии сценария по возрастанию номера; пустой список — сценарий без AI-workflow. */
export function listStoredAiVersions(
  scenarioId: string,
): { createdBy: string; version: AIScenarioVersion }[] {
  return cloneOut(
    getMockState()
      .aiScenarioVersions.filter((entry) => entry.version.scenarioId === scenarioId)
      .sort((left, right) => left.version.version - right.version.version),
  );
}

export function insertStoredAiVersion(createdBy: string, version: AIScenarioVersion): AIScenarioVersion {
  getMockState().aiScenarioVersions.push({ createdBy, version: cloneOut(version) });
  return cloneOut(version);
}

export function replaceStoredAiVersion(version: AIScenarioVersion): AIScenarioVersion {
  const entry = getMockState().aiScenarioVersions.find(
    (candidate) =>
      candidate.version.scenarioId === version.scenarioId && candidate.version.version === version.version,
  );
  if (entry) entry.version = cloneOut(version);
  return cloneOut(version);
}

export function findStoredAiRequest<TResponse>(key: string): TResponse | undefined {
  const cached = getMockState().aiRequests[key];
  return cached === undefined ? undefined : cloneOut(cached as TResponse);
}

export function saveStoredAiRequest<TResponse>(key: string, response: TResponse): TResponse {
  getMockState().aiRequests[key] = cloneOut(response);
  return cloneOut(response);
}
