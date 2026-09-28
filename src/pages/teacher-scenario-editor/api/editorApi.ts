/*
 * Клиент данных `/teacher/scenarios/[id]` (T3.1-10…T3.1-16): чтение сценария, правка параметров,
 * эталона и критериев (PATCH), коррекция и валидация (POST /scenarios/[id]/validate), повторная
 * мок-генерация и проверка грамматики через ИИ-шлюз (US3: с привязкой к сценарию и его версии).
 */
import {
  approveAIScenario,
  checkGrammar,
  createAIScenarioDrafts,
  generateScenarios,
  getScenario,
  listAIScenarioVersions,
  reviseAIScenario,
  updateScenario,
  validateScenario,
} from "@/shared/api";
import type {
  AIScenarioApproveRequest,
  AIScenarioDraftRequest,
  AIScenarioReviseRequest,
  AIScenarioVersion,
  GrammarCheckBinding,
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
  checkGrammar: (
    text: string,
    field?: string,
    binding?: GrammarCheckBinding,
  ) => Promise<{ data: GrammarError[] }>;
  listAIScenarioVersions: (scenarioId: string, signal?: AbortSignal) => Promise<AIScenarioVersion[]>;
  createAIScenarioDrafts: (body: AIScenarioDraftRequest) => Promise<AIScenarioVersion[]>;
  reviseAIScenario: (scenarioId: string, body: AIScenarioReviseRequest) => Promise<AIScenarioVersion>;
  approveAIScenario: (scenarioId: string, body: AIScenarioApproveRequest) => Promise<AIScenarioVersion>;
};

export const defaultScenarioEditorApi: ScenarioEditorApi = {
  getScenario,
  updateScenario,
  validateScenario,
  generateScenarios,
  checkGrammar,
  listAIScenarioVersions,
  createAIScenarioDrafts,
  reviseAIScenario,
  approveAIScenario,
};
