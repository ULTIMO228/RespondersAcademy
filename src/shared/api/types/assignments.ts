/*
 * Задания и экзамен — контракт /api/v1/assignments (спека 002; backend/app/schemas/v1/assignments.py,
 * services/assignment_service.py). Обучающийся запускает задание, завершает его только преподаватель/администратор.
 */
import type { CardAttemptResponse } from "./attempts";
import type { OperatorAttempt } from "./operator112";
import type { StudentCardEtalon } from "./student-cards";

/**
 * "chain" (цепочка A → B) выведен 20.10.2026 (spec/007 Clarifications): приходит только в старых заданиях,
 * которые открываются на чтение. Новые задания — только AssignableMode.
 */
export type TrainingMode = "dds" | "operator112" | "chain";
export type AssignableMode = Exclude<TrainingMode, "chain">;
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
  /** «Справочник доступен» (спека 005); сервер всегда записывает итог: тренировка — true, экзамен — false по умолчанию. */
  referenceAllowed?: boolean;
  /** Эталоны карточек обучающихся-112, подтверждённые преподавателем (спека 011). */
  studentCards?: StudentCardEtalon[];
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

export interface AssignmentProgress {
  studentId: string;
  cardId: string;
  state: AssignmentLinkState;
  attemptId: string;
  score?: number;
  passed?: boolean;
}

export interface AssignmentDetail extends Assignment {
  progress: AssignmentProgress[];
}

export type AssignmentListQuery = {
  studentId?: string;
  teacherId?: string;
  state?: AssignmentState;
};

/** Ответ start в размеченном виде: попытка режима 112 либо compat-попытка ДДС. */
export type StartAssignmentResult =
  | { kind: "operator112"; attempt: OperatorAttempt }
  | { kind: "dds"; sessionId: string; attempt: CardAttemptResponse["attempt"]; created: boolean };

/** Утверждённая версия AI-сценария, выбранная для билета (её режим совпадает с режимом задания). */
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
  trainingMode: AssignableMode;
  format: AssignmentFormat;
  cardIds?: string[];
  scenarioVersions?: AssignmentScenarioVersion[];
  /** Только режим ДДС: по записи на каждую карточку обучающегося-112 из cardIds (спека 011). */
  studentCards?: StudentCardEtalon[];
  randomRule?: AssignmentRandomRule;
  params?: AssignmentParams;
  dueAt?: string;
  title?: string;
}
