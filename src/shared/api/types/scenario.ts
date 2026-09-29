/*
 * Учебные сценарии и эталоны — spec/000-фронт/05-data-models.md §6 (mocks/scenarios.json, 36 шт.).
 */
import type { ScenarioMode } from "./session";

/** Норматив п. 1.4: шаблон / генеративная вариация. */
export type ScenarioLevel = "beginner" | "advanced";

/**
 * [расширение] гранулярная сложность.
 * Маппинг: beginner ↔ difficulty 1–2, advanced ↔ difficulty 3–5.
 */
export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type ScenarioValidationStatus = "draft" | "pending" | "approved" | "rejected";

/** template — шаблон; generated — сгенерирован ИИ (контракт бейджа «ИИ» в UI). */
export type ScenarioSource = "template" | "generated";

export interface Etalon {
  expectedFields?: Record<string, string>;
  /** Ожидаемая последовательность действий (статусы ДДС, звонок точке C). */
  expectedActions: string[];
  expectedText?: string;
  keyPhrases: string[];
}

export interface ScenarioValidation {
  status: ScenarioValidationStatus;
  /** userId преподавателя. */
  reviewedBy?: string;
  comment?: string;
  /** Поля, утверждённые частично (approvePartial) — заполняется мок-слоем. */
  approvedFields?: string[];
}

export interface ScenarioTimeNorms {
  /** Норматив первичной реакции, сек (30). */
  primaryReactionSec: number;
  /** Норматив полной обработки, сек (180). */
  fullProcessingSec: number;
}

export interface ScenarioHints {
  enabled: boolean;
  texts: string[];
}

export interface SuccessCriteria {
  maxGrammarErrors: number;
  requiredFields: string[];
  syntaxRequirements: string;
}

export interface Scenario {
  /** "s-001" */
  id: string;
  title: string;
  level: ScenarioLevel;
  sourceTicketNo: number;
  /** Очередь карточек → IncidentCard.id. */
  cardIds: string[];
  timeNorms: ScenarioTimeNorms;
  hints: ScenarioHints;
  /** Внутренний номер главной службы для голосового контура B→C. */
  callTarget?: string;
  difficulty: Difficulty;
  etalon: Etalon;
  validation: ScenarioValidation;
  successCriteria: SuccessCriteria;
  source: ScenarioSource;
  /**
   * [расширение] Режим отработки по умолчанию (spec/000-фронт/04-pages/11, редактор п. 1: demo/follow/practice).
   * В spec/05 §6 поля нет — в mocks/scenarios.json оно отсутствует; мастер занятия задаёт Session.mode.
   */
  mode?: ScenarioMode;
}

export type AIWorkflowMode = "operator112" | "dds";
export type AIWorkflowSourceKind = "ticket" | "template" | "llm" | "student_card";
export type AIWorkflowApproval = "draft" | "validation_failed" | "pending_review" | "approved" | "rejected";
export type AIWorkflowValidation = "pending" | "passed" | "failed";
export type AIFieldDecisionKind = "accepted" | "edited" | "rejected";

export interface AIValidationError {
  fieldPath: string;
  code: string;
  message: string;
}

export interface AIFieldDecision {
  fieldPath: string;
  decision: AIFieldDecisionKind;
  value?: unknown;
  teacherId: string;
  at: string;
  comment?: string;
}

export interface AIExpectedAction {
  action: string;
  sourceRef: string[];
}

export interface AIScenarioVersion {
  schemaVersion: "ai-workflow/1";
  scenarioId: string;
  version: number;
  mode: AIWorkflowMode;
  sourceTicketId: string;
  sourceSituationNo: number;
  sourceKind: AIWorkflowSourceKind;
  sourceHash: string;
  sourceAttemptId?: string;
  sourceCardId?: string;
  sourceCardVersion?: number;
  parentVersion?: number;
  teacherComment?: string;
  validation: AIWorkflowValidation;
  validationErrors: AIValidationError[];
  approval: AIWorkflowApproval;
  cardSnapshot: { id: string; fields: Record<string, unknown> };
  etalonVersion: string;
  ruleSourceIds: string[];
  semanticFacts: Record<string, unknown>[];
  classifierVersion: string;
  etalon: {
    expectedFields: Record<string, unknown>;
    expectedActions: AIExpectedAction[];
    semanticFacts: Record<string, unknown>[];
    ruleSourceIds: string[];
    classifierVersion: string;
  };
  fieldDecisions: AIFieldDecision[];
  approvedBy?: string;
  /** Только в ответе на создание черновиков: чем и за сколько сгенерировано. */
  generation?: AIScenarioGeneration;
}

export type AIScenarioGeneratorKind = "auto" | "template" | "ai";

export interface AIScenarioGeneration {
  /** `template` — статичный шаблон, `ollama:<модель>` — локальная LLM, `mock` — автономный мок без ИИ. */
  provider: string;
  durationMs: number;
}

export interface AIScenarioDraftRequest {
  mode: AIWorkflowMode;
  sourceTicketId: string;
  category: string;
  count: number;
  generator?: AIScenarioGeneratorKind;
  requestId: string;
}

export interface AIFieldDecisionInput {
  fieldPath: string;
  decision: AIFieldDecisionKind;
  value?: unknown;
}

export interface AIScenarioReviseRequest {
  baseVersion: number;
  comment: string;
  acceptedFields: AIFieldDecisionInput[];
  requestId: string;
}

export interface AIScenarioApproveRequest {
  version: number;
  requestId: string;
}
