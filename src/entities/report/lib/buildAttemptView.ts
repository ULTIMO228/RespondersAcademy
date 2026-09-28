import { formatDateTime, formatDuration } from "@/shared/lib";

import {
  EVALUATION_CRITERIA,
  PROCESSING_NORM_MS,
  REACTION_NORM_MS,
  SEVERITY_TITLES,
} from "../config/evaluation";
import type { AttemptView, ProgressNorms, TeacherOverride } from "../model/attempt";
import { getMistakeCategory, toMistakeSeverity } from "./mistakes";

type AttemptCard = {
  cardNumber: string;
  cardType: string;
  cardHref: string;
};

/** Оценка попытки в объёме разбора (контрактная Evaluation и прототипная совместимы структурно). */
export type AttemptEvaluationView = {
  revision?: number;
  status?: "pending" | "preliminary" | "review_required" | "final";
  timeScore: number;
  correctnessScore: number;
  grammarScore: number;
  semanticScore: number;
  totalScore?: number | null;
  errors: { type: string; severity: string; message: string }[];
  grammarErrors: { fragment: string; wrong: string; expected: string }[];
  aiComment: string;
  teacherOverride?: TeacherOverride;
};

/** Попытка (CardEvent) с оценкой (Evaluation из GET /attempts/[id]/evaluation или из занятия). */
export type AttemptSource = {
  id: string;
  openedAt: string;
  primaryReactionMs: number;
  fullProcessingMs: number;
  evaluation: AttemptEvaluationView;
};

const DEFAULT_NORMS: ProgressNorms = { reactionMs: REACTION_NORM_MS, processingMs: PROCESSING_NORM_MS };

/** Балл попытки: правка преподавателя приоритетна (Q&A в3); при review_required и pending балл не выставляется. */
export function getAttemptScore(
  evaluation: Pick<AttemptEvaluationView, "totalScore" | "teacherOverride"> & {
    status?: "pending" | "preliminary" | "review_required" | "final";
  },
): number | null {
  if (evaluation.teacherOverride) return evaluation.teacherOverride.score;
  if (evaluation.status === "review_required" || evaluation.status === "pending") return null;
  return evaluation.totalScore ?? null;
}

/** CardEvent + Evaluation → строка истории попыток с разбором оценки; нормативы — из сценария. */
export function buildAttemptView(
  event: AttemptSource,
  card: AttemptCard,
  norms: ProgressNorms = DEFAULT_NORMS,
): AttemptView {
  const { evaluation } = event;
  const status = evaluation.status ?? (evaluation.teacherOverride ? "final" : "preliminary");
  return {
    id: event.id,
    openedAt: formatDateTime(event.openedAt),
    ...card,
    reaction: formatDuration(event.primaryReactionMs),
    isReactionExceeded: event.primaryReactionMs > norms.reactionMs,
    processing: formatDuration(event.fullProcessingMs),
    isProcessingExceeded: event.fullProcessingMs > norms.processingMs,
    score: getAttemptScore({ ...evaluation, status }),
    status,
    revision: evaluation.revision,
    grammarErrorCount: evaluation.grammarErrors.length,
    criteria: EVALUATION_CRITERIA.map(({ key, title }) => ({ key, title, score: evaluation[key] ?? 0 })),
    mistakes: evaluation.errors.map((error) => ({
      category: getMistakeCategory(error.type),
      severity: toMistakeSeverity(error.severity),
      severityTitle: SEVERITY_TITLES[error.severity] ?? error.severity,
      message: error.message,
    })),
    grammarErrors: evaluation.grammarErrors.map(({ fragment, wrong, expected }) => ({
      fragment,
      wrong,
      expected,
    })),
    aiComment: evaluation.aiComment,
    teacherOverride: evaluation.teacherOverride,
  };
}
