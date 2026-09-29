import type { Evaluation, FieldDiff, OperatorEvaluation } from "@/shared/api";

export type ReviewError = { type: string; message: string; severity?: string };

export type ReviewModel = {
  totalScore: number;
  axes: { timeScore: number; correctnessScore: number; grammarScore: number; semanticScore: number };
  errors: ReviewError[];
  /** Различия с эталоном — только у режима 112 (у карточки ДДС их нет). */
  fieldDiff: FieldDiff[] | null;
  aiComment: string;
  assessorVersion?: string;
  /** Экзамен с порогом: сдал/не сдал; у тренировки undefined. */
  passed?: boolean;
  /** Решение преподавателя имеет приоритет над оценкой ИИ (Q&A в3). */
  teacherOverride?: { score: number; comment: string; by: string; at: string };
  /** Оценка ещё не окончательная: ждёт проверки преподавателем. */
  reviewPending: boolean;
};

const UNKNOWN_ERROR = "Ошибка без описания";

function toReviewError(raw: Record<string, unknown>): ReviewError {
  const type = typeof raw.type === "string" ? raw.type : "unknown";
  const message = typeof raw.message === "string" && raw.message ? raw.message : UNKNOWN_ERROR;
  return { type, message, severity: typeof raw.severity === "string" ? raw.severity : undefined };
}

export function fromOperatorEvaluation(evaluation: OperatorEvaluation): ReviewModel {
  return {
    totalScore: evaluation.totalScore,
    axes: {
      timeScore: evaluation.timeScore,
      correctnessScore: evaluation.correctnessScore,
      grammarScore: evaluation.grammarScore,
      semanticScore: evaluation.semanticScore,
    },
    errors: evaluation.errors.map(toReviewError),
    fieldDiff: evaluation.fieldDiff,
    aiComment: evaluation.aiComment,
    assessorVersion: evaluation.assessorVersion,
    passed: evaluation.passed,
    reviewPending: false,
  };
}

export function fromDdsEvaluation(evaluation: Evaluation): ReviewModel {
  return {
    totalScore: evaluation.teacherOverride?.score ?? evaluation.totalScore,
    axes: {
      timeScore: evaluation.timeScore,
      correctnessScore: evaluation.correctnessScore,
      grammarScore: evaluation.grammarScore,
      semanticScore: evaluation.semanticScore,
    },
    errors: [
      ...evaluation.errors.map((error) => ({
        type: error.type,
        message: error.message,
        severity: error.severity,
      })),
      ...evaluation.grammarErrors.map((error) => ({
        type: "grammar",
        message: `Грамматика (${error.field}): «${error.wrong}» → «${error.expected}»`,
      })),
    ],
    fieldDiff: null,
    aiComment: evaluation.aiComment,
    teacherOverride: evaluation.teacherOverride
      ? {
          score: evaluation.teacherOverride.score,
          comment: evaluation.teacherOverride.comment,
          by: evaluation.teacherOverride.by,
          at: evaluation.teacherOverride.at,
        }
      : undefined,
    reviewPending: evaluation.status === "review_required" || evaluation.status === "preliminary",
  };
}

/** Значение поля сличения одной строкой: пусто → «—», объекты — JSON. */
export function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return JSON.stringify(value);
}
