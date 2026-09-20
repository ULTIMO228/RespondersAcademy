/*
 * Клиент данных `/teacher/scenarios/[id]` (T3.1-10…T3.1-16): чтение сценария, правка параметров,
 * эталона и критериев (PATCH), коррекция и валидация (POST /scenarios/[id]/validate), повторная
 * мок-генерация и проверка грамматики через ИИ-шлюз.
 */
import { checkGrammar, generateScenarios, getScenario, updateScenario, validateScenario } from "@/shared/api";
import type {
  GrammarError,
  Scenario,
  ScenarioGenerateRequest,
  ScenarioUpdateRequest,
  ScenarioValidateRequest,
} from "@/shared/api";

export type ScenarioEditorApi = {
  getScenario: (scenarioId: string, signal?: AbortSignal) => Promise<Scenario>;
  updateScenario: (scenarioId: string, body: ScenarioUpdateRequest) => Promise<Scenario>;
  validateScenario: (scenarioId: string, body: ScenarioValidateRequest) => Promise<Scenario>;
  generateScenarios: (body: ScenarioGenerateRequest) => Promise<Scenario[]>;
  checkGrammar: (text: string, field?: string) => Promise<{ data: GrammarError[] }>;
};

export const defaultScenarioEditorApi: ScenarioEditorApi = {
  getScenario,
  updateScenario,
  validateScenario,
  generateScenarios,
  checkGrammar,
};
