/*
 * Схема учебного сценария (фича 013, spec/013-visual-scenario-builder/data-model.md §1–3, формат flow/1).
 * Прототип конструктора держит схему в браузере; серверное хранение и версии — следующая фаза (plan.md Ф2).
 */

export type FlowMode = "dds" | "operator112";

export type FlowNodeType =
  | "start"
  | "end"
  | "incomingCall"
  | "callerReply"
  | "requiredQuestion"
  | "action"
  | "forbiddenAction"
  | "condition"
  | "randomVariant"
  | "briefing"
  | "hint";

/** Группа библиотеки: определяет цвет полосы и плитки блока (design-concept.md §12). */
export type FlowGroupId = "call" | "action" | "logic" | "learn" | "edge";

export type FlowPropValue = string | number | boolean;

export interface FlowPoint {
  x: number;
  y: number;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  /** Название шага, заданное автором; без него показывается краткое содержание настроек. */
  title?: string;
  position: FlowPoint;
  props: Record<string, FlowPropValue>;
}

export interface FlowEdge {
  id: string;
  from: { node: string; port: string };
  to: { node: string };
}

export interface FlowSettings {
  /** Норматив реакции, сек (Q&A в6: 30). */
  primaryReactionSec: number;
  /** Норматив отработки, сек (Q&A в6: 180). */
  fullProcessingSec: number;
  /** Доля балла за действие с опозданием, %. */
  lateCreditPercent: number;
  /** Штраф за показанную подсказку, баллы. */
  hintPenalty: number;
  /** Проходной балл, 0–100. */
  passThreshold: number;
  /** Описание для студента. */
  description: string;
}

export interface FlowGraph {
  schemaVersion: "flow/1";
  title: string;
  mode: FlowMode;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings: FlowSettings;
}

export interface FlowOption {
  value: string;
  label: string;
}

export interface FlowCardOption extends FlowOption {
  summary: string;
  address: string;
  callerName: string;
  callerPhone: string;
}

export interface FlowStatusOption extends FlowOption {
  /** Допустимые следующие статусы по справочнику (reference.ddsStatuses[].next). */
  next: string[];
}

/** Справочники для настроек блоков; собираются на сервере из моков и передаются пропсами. */
export interface FlowDictionaries {
  cards: FlowCardOption[];
  ddsStatuses: FlowStatusOption[];
  services: FlowOption[];
  phoneNumbers: FlowOption[];
  signs: FlowOption[];
}

export type FlowSelection = { kind: "node"; id: string } | { kind: "edge"; id: string } | null;

export type FlowIssueLevel = "error" | "warning";

export interface FlowIssue {
  code: string;
  level: FlowIssueLevel;
  message: string;
  nodeId?: string;
  edgeId?: string;
  port?: string;
}

export interface FlowValidationReport {
  ok: boolean;
  errors: FlowIssue[];
  warnings: FlowIssue[];
  stats: { nodes: number; edges: number; paths: number; maxScore: number };
}
