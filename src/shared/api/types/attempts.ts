/*
 * Попытка курсанта по карточке (CardEvent, spec/000-фронт/05-data-models.md §7) — открытие и ход отработки (T2.3-01).
 * Незавершённая попытка: completedAt = "" и fullProcessingMs = 0 (до «Работы завершены» / «Отказ…»).
 */
import type { CardEvent, CardStatusMark } from "./session";

/** POST /api/mock/cards/[id]/attempt — открыть (создать или продолжить) попытку курсанта. */
export interface CardAttemptRequest {
  studentId: string;
  /** Время выдачи карточки (CardFlowItem.issuedAt), если известно клиенту ленты. */
  issuedAt?: string;
}

export interface CardAttemptResponse {
  sessionId: string;
  attempt: CardEvent;
  /** false — попытка уже была открыта (повторное открытие идемпотентно). */
  created: boolean;
}

/** POST /api/mock/attempts/[id]/progress — ход отработки: статус, введённый текст, завершение. */
export interface AttemptProgressRequest {
  status?: CardStatusMark;
  enteredText?: Record<string, string>;
  /** Завершение попытки (ISO): fullProcessingMs = completedAt − openedAt. */
  completedAt?: string;
}

export type EvaluationStatus = "pending" | "preliminary" | "review_required" | "final";

export interface AssessmentAxes {
  timeScore: number | null;
  correctnessScore: number | null;
  grammarScore: number | null;
  semanticScore: number | null;
}

export interface AssessmentStateResponse {
  attemptId: string;
  mode: "operator112" | "dds";
  status: EvaluationStatus;
  revision: number;
  availableAxes: Array<"timeScore" | "correctnessScore" | "grammarScore" | "semanticScore">;
  axes: AssessmentAxes;
  totalScore?: number | null;
  reasonCode?: string | null;
  updatedAt: string;
}

export interface SemanticReviewItem {
  id: string;
  attemptId: string;
  fieldPath: string;
  referenceFactIds: string[];
  reason: string;
  baseSimilarity?: number | null;
  thresholdVersion: string;
  decision: "equivalent" | "different" | "uncertain";
  explanation: string;
  modelReleaseId?: string | null;
  validatedAt?: string | null;
}

export interface AssessmentReviewResponse {
  attemptId: string;
  mode: "operator112" | "dds";
  status: EvaluationStatus;
  revision: number;
  availableAxes: Array<"timeScore" | "correctnessScore" | "grammarScore" | "semanticScore">;
  axes: AssessmentAxes;
  totalScore?: number | null;
  etalonVersion: string;
  assessorVersion: string;
  modelReleaseId?: string | null;
  semanticReviews: SemanticReviewItem[];
  errorRecords: unknown[];
  teacherOverride?: {
    teacherId: string;
    score: number;
    comment: string;
    at: string;
    previousScore?: number;
  } | null;
  updatedAt: string;
}

export interface SemanticArbitrationDecision {
  reviewId: string;
  decision: "equivalent" | "different" | "uncertain";
  comment?: string;
}

export interface AssessmentResolveRequest {
  expectedRevision: number;
  score: number;
  comment: string;
  semanticDecisions?: SemanticArbitrationDecision[];
  requestId: string;
}
