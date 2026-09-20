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
  timeScore: number;
  correctnessScore: number;
  grammarScore: number;
  semanticScore: number;
  totalScore: number;
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

/** Балл попытки: правка преподавателя приоритетна (Q&A в3); в UI не пересчитывается. */
export function getAttemptScore(evaluation: Pick<AttemptEvaluationView, "totalScore" | "teacherOverride">) {
  return evaluation.teacherOverride?.score ?? evaluation.totalScore;
}

/** CardEvent + Evaluation → строка истории попыток с разбором оценки; нормативы — из сценария. */
export function buildAttemptView(
  event: AttemptSource,
  card: AttemptCard,
  norms: ProgressNorms = DEFAULT_NORMS,
): AttemptView {
  const { evaluation } = event;
  return {
    id: event.id,
    openedAt: formatDateTime(event.openedAt),
    ...card,
    reaction: formatDuration(event.primaryReactionMs),
    isReactionExceeded: event.primaryReactionMs > norms.reactionMs,
    processing: formatDuration(event.fullProcessingMs),
    isProcessingExceeded: event.fullProcessingMs > norms.processingMs,
    score: getAttemptScore(evaluation),
    grammarErrorCount: evaluation.grammarErrors.length,
    criteria: EVALUATION_CRITERIA.map(({ key, title }) => ({ key, title, score: evaluation[key] })),
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
