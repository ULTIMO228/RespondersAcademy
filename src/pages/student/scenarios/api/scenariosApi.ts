/* Зависимости страниц сценариев с графом: функции shared/api за интерфейсом (в тестах подменяются целиком). */
import {
  finishScenarioRun,
  getScenarioRun,
  listAssignedScenarios,
  performScenarioAction,
  startScenarioRun,
} from "@/shared/api";
import type { AssignedScenario, ScenarioActionRequest, ScenarioRunView } from "@/shared/api";

export type StudentScenariosApi = {
  list: (signal?: AbortSignal) => Promise<AssignedScenario[]>;
  /** Запускает прогон версии либо возвращает активный. */
  start: (scenarioId: string, version: number, signal?: AbortSignal) => Promise<ScenarioRunView>;
  get: (runId: string) => Promise<ScenarioRunView>;
  act: (runId: string, body: ScenarioActionRequest) => Promise<ScenarioRunView>;
  finish: (runId: string) => Promise<ScenarioRunView>;
};

export const studentScenariosApi: StudentScenariosApi = {
  list: (signal) => listAssignedScenarios(signal),
  start: (scenarioId, version, signal) => startScenarioRun(scenarioId, version, signal),
  get: (runId) => getScenarioRun(runId),
  act: (runId, body) => performScenarioAction(runId, body),
  finish: (runId) => finishScenarioRun(runId),
};
