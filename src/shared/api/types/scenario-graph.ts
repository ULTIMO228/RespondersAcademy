/*
 * Граф сценария 112 `scenario-graph/1` (spec/005-scenario-graph-builder/spec.md §3) и контракты /api/v1/ai/scenarios*.
 * Повторяет схему бэкенда 1:1: все поля сверх базовых необязательны.
 */
import type { AIWorkflowApproval, AIWorkflowMode, AIWorkflowSourceKind } from "./scenario";
import type { AIWorkflowValidation } from "./scenario";

export const SCENARIO_GRAPH_SCHEMA = "scenario-graph/1" as const;

export type GraphNodeType = "action" | "condition" | "end";
export type GraphFactScalar = string | number | boolean;
export type GraphPredicateOp = "eq" | "ne" | "in" | "gt" | "ge" | "lt" | "le" | "exists";

export interface GraphLeafPredicate {
  fact: string;
  op: GraphPredicateOp;
  value?: GraphFactScalar | GraphFactScalar[];
}
export interface GraphAllPredicate {
  all: GraphPredicate[];
}
export interface GraphAnyPredicate {
  any: GraphPredicate[];
}
export interface GraphNotPredicate {
  not: GraphPredicate;
}
export type GraphPredicate = GraphLeafPredicate | GraphAllPredicate | GraphAnyPredicate | GraphNotPredicate;

export interface GraphInputOption {
  value: string;
  label: string;
  penalty?: number;
}
export interface GraphInput {
  fact: string;
  options: GraphInputOption[];
}
export interface GraphBranch {
  name: string;
  when: GraphPredicate;
  next: string;
}
export interface GraphElse {
  name: string;
  next: string;
}

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title?: string;
  prompt?: string;
  /** Код действия (action). */
  action?: string;
  /** Подпись кнопки (action). */
  label?: string;
  sets?: Record<string, GraphFactScalar>;
  input?: GraphInput;
  next?: string;
  maxVisits?: number;
  branches?: GraphBranch[];
  else?: GraphElse;
  outcome?: string;
  score?: number;
  passed?: boolean;
}

export interface GraphDecoy {
  action: string;
  label: string;
}
export interface GraphScoring {
  wrongActionPenalty?: number;
  passScore?: number;
}
export interface GraphLayoutPoint {
  x: number;
  y: number;
}

export interface ScenarioGraph {
  schemaVersion: typeof SCENARIO_GRAPH_SCHEMA;
  start: string;
  nodes: GraphNode[];
  decoys?: GraphDecoy[];
  scoring?: GraphScoring;
  layout?: Record<string, GraphLayoutPoint>;
}

export type ScenarioPermission = "scenario.review" | "scenario.publish";

export interface ScenarioPermissionsResponse {
  permissions: ScenarioPermission[];
}

export interface ScenarioSourceItem {
  sourceTicketId: string;
  situationNo: number;
  preview: string;
}

export interface GraphValidationError {
  message: string;
  nodeId: string | null;
}
export interface GraphValidationResult {
  valid: boolean;
  errors: GraphValidationError[];
}

export interface AIScenarioListQuery {
  mode?: AIWorkflowMode;
  approval?: AIWorkflowApproval;
}
export interface AIScenarioListItem {
  scenarioId: string;
  title: string;
  mode: AIWorkflowMode;
  latestVersion: number;
  approval: AIWorkflowApproval;
  validation: AIWorkflowValidation;
  sourceKind: AIWorkflowSourceKind;
  hasGraph: boolean;
  updatedAt: string;
}

export interface ScenarioGraphCreateRequest {
  mode: AIWorkflowMode;
  sourceTicketId: string;
  category: string;
  title?: string;
  summary: string;
  address?: string;
  graph?: ScenarioGraph;
  requestId: string;
}
export interface ScenarioGraphReviseRequest {
  baseVersion: number;
  comment?: string;
  acceptedFields?: { fieldPath: string; decision: "accepted" | "edited" | "rejected"; value?: unknown }[];
  graph?: ScenarioGraph;
  requestId: string;
}
export interface ScenarioSubmitRequest {
  version: number;
  requestId: string;
}
export interface ScenarioReviewRequest {
  version: number;
  decision: "accept" | "reject";
  comment?: string;
  requestId: string;
}
export interface ScenarioPublishRequest {
  version: number;
  requestId: string;
}

export interface ScenarioDeriveRequest {
  comment?: string;
  requestId: string;
}

/* Прохождение графа обучающимся (спека 005 §4, этап S6): /ai/scenario-assignments, /ai/scenario-runs*. */
export type ScenarioRunStatus = "waiting" | "completed" | "aborted" | "faulted";

export interface ScenarioRunResult {
  score: number;
  passed: boolean;
  outcome: string;
  outcomeTitle: string;
  wrongAttempts: number;
  steps: number;
  durationMs: number;
  finishedAt: string;
}

/** Результат в списке прогонов преподавателя: дополнительно маршрут и выбранные ветки. */
export interface ScenarioRunResultDetail extends ScenarioRunResult {
  path: string[];
  branches: string[];
}

export interface ScenarioRunStep {
  title: string | null;
  prompt: string | null;
  input: { options: { value: string; label: string }[] } | null;
}

export interface ScenarioRunAction {
  action: string;
  label: string;
}

/** Вид прогона для обучающегося: маршрут и правильное действие не раскрываются. */
export interface ScenarioRunView {
  runId: string;
  scenarioId: string;
  version: number;
  studentId: string;
  status: ScenarioRunStatus;
  outcome: string | null;
  steps: number;
  step?: ScenarioRunStep;
  actions?: ScenarioRunAction[];
  result?: ScenarioRunResult;
}

export interface AssignedScenario {
  assignmentId: string;
  assignmentTitle: string;
  scenarioId: string;
  version: number;
  title: string;
  mode: AIWorkflowMode;
  attempts: number;
  activeRunId: string | null;
  lastResult?: ScenarioRunResult;
  dueAt?: string;
}

export interface ScenarioActionRequest {
  action: string;
  expectedSteps: number;
  choice?: string;
}

export interface ScenarioRunListItem {
  runId: string;
  scenarioId: string;
  version: number;
  studentId: string;
  status: ScenarioRunStatus;
  createdAt: string;
  finishedAt?: string;
  result?: ScenarioRunResultDetail;
}
