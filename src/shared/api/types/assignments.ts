/*
 * Задания и экзамен — контракт /api/v1/assignments (спека 002; backend/app/schemas/v1/assignments.py,
 * services/assignment_service.py). Обучающийся запускает задание, завершает его только преподаватель/администратор.
 */
import type { CardAttemptResponse } from "./attempts";
import type { OperatorAttempt } from "./operator112";

export type TrainingMode = "dds" | "operator112" | "chain";
export type AssignmentFormat = "training" | "exam";
export type AssignmentState = "active" | "finished";
/** Состояние ссылки «задание ↔ попытка»; notCompleted — лимит времени или завершение задания. */
export type AssignmentLinkState = "ringing" | "answered" | "submitted" | "notCompleted";

export interface AssignmentNorms {
  answerSec: number;
  submitSec: number;
}

export interface AssignmentHints {
  enabled: boolean;
  idleSec?: number;
  steps?: { stage: string; text: string }[];
}

/** Параметры занятия; экзамен принудительно выключает подсказки. timeLimitSec — на каждую попытку от openedAt. */
export interface AssignmentParams {
  norms?: AssignmentNorms;
  hints?: AssignmentHints;
  passThreshold?: number;
  timeLimitSec?: number;
  maxGrammarErrors?: number;
  workMessagesEnabled?: boolean;
  workMessageIntervalsSec?: number[];
  adaptive?: boolean;
}

export interface AssignmentRandomRule {
  groups: string[];
  difficulty: number[];
  count: number;
}

export interface Assignment {
  id: string;
  teacherId: string;
  studentIds: string[];
  trainingMode: TrainingMode;
  format: AssignmentFormat;
  cardIds: string[];
  params: AssignmentParams;
  state: AssignmentState;
  createdAt: string;
  title: string;
  randomRule?: AssignmentRandomRule;
  dueAt?: string;
}

/** Вход ДДС цепочки A → B, ожидающий подтверждения преподавателя (POST /ai/scenarios/{scenarioId}/approve). */
export interface ChainReview {
  scenarioId: string;
  version: number;
  approval: string;
  validation: string;
}

/**
 * Вход ДДС в ответе submit этапа A (services/ai_scenario_service.create_chain_dds_draft): только адрес версии и сохранённая
 * карточка. Статус подтверждения (ChainReview.approval) приходит отдельно — в progress задания.
 */
export interface ChainSubmitReview {
  scenarioId: string;
  version: number;
  /** id карточки, сохранённой при передаче этапа A; с неё начнётся этап ДДС. */
  cardId: string;
}

export interface AssignmentProgress {
  studentId: string;
  cardId: string;
  state: AssignmentLinkState;
  attemptId: string;
  score?: number;
  passed?: boolean;
  chainReview?: ChainReview;
}

export interface AssignmentDetail extends Assignment {
  progress: AssignmentProgress[];
}

export type AssignmentListQuery = {
  studentId?: string;
  teacherId?: string;
  state?: AssignmentState;
};

/** Ответ start в размеченном виде: попытка режима 112 (в т.ч. этап A цепочки) либо compat-попытка ДДС. */
export type StartAssignmentResult =
  | { kind: "operator112"; attempt: OperatorAttempt }
  | { kind: "dds"; sessionId: string; attempt: CardAttemptResponse["attempt"]; created: boolean };

/** Версия сценария, выбранная для билета (обязательна для chain: утверждённая версия operator112). */
export interface AssignmentScenarioVersion {
  scenarioId: string;
  version: number;
  cardId: string;
}

/**
 * POST /assignments (backend/schemas/v1/assignments.py::AssignmentCreateRequest): ровно один источник билетов —
 * cardIds либо randomRule; teacherId обязателен только администратору; экзамен сервер создаёт без подсказок.
 */
export interface AssignmentCreateRequest {
  studentIds: string[];
  teacherId?: string;
  trainingMode: TrainingMode;
  format: AssignmentFormat;
  cardIds?: string[];
  scenarioVersions?: AssignmentScenarioVersion[];
  randomRule?: AssignmentRandomRule;
  params?: AssignmentParams;
  dueAt?: string;
  title?: string;
}
