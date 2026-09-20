/*
 * Мок-оценка попытки (T1.2-08). ИИ-модуль: заменить на реальный сервис.
 * getAttemptEvaluation: готовая оценка из sessions.json отдаётся как есть (включая teacherOverride —
 * приоритет преподавателя, Q&A в3); иначе generateEvaluation по эталону сценария. Детерминизм:
 * один и тот же ввод → тот же объект оценки (без Date.now/случайности). Данные — параметрами (ридеры).
 */
import { resolveTimeNorms } from "@/entities/session/@x/report";
import type { TimeNormsMs } from "@/entities/session/@x/report";
import { checkGrammarFields } from "@/shared/lib";
import type {
  CardEventContract,
  Etalon,
  Evaluation,
  Scenario,
  SessionContract,
  SuccessCriteria,
} from "@/shared/api";

import {
  clampScore,
  collectAttemptActions,
  findMissingRequiredFields,
  getExpectedCardActions,
  scoreCorrectness,
  scoreGrammar,
  scoreSemantic,
  scoreTime,
} from "./evaluate-axes";
import { DEFAULT_SCORE_WEIGHTS } from "./score-weights";
import type { ScoreAxis, ScoreWeights } from "./score-weights";

/** Пометка ИИ-происхождения комментария (UI дополнительно показывает бейдж «ИИ»). */
export const AI_COMMENT_PREFIX = "ИИ-оценка (мок):";

export type GenerateEvaluationOptions = {
  /** Нормативы попытки; по умолчанию — дефолты заказчика 30 с / 180 с. */
  timeNorms?: TimeNormsMs;
  weights?: Readonly<ScoreWeights>;
};

type AxisScores = Record<ScoreAxis, number>;

export function computeTotalScore(
  scores: AxisScores,
  weights: Readonly<ScoreWeights> = DEFAULT_SCORE_WEIGHTS,
): number {
  const axes = Object.keys(weights) as ScoreAxis[];
  const weightSum = axes.reduce((sum, axis) => sum + weights[axis], 0);
  if (weightSum <= 0) return 0;
  return clampScore(axes.reduce((sum, axis) => sum + scores[axis] * weights[axis], 0) / weightSum);
}

function buildAiComment(scores: AxisScores, errorCount: number): string {
  const verdict = errorCount === 0 ? "Замечаний нет." : `Замечаний: ${errorCount}.`;
  return (
    `${AI_COMMENT_PREFIX} время ${scores.timeScore}, соответствие эталону ${scores.correctnessScore}, ` +
    `грамматика ${scores.grammarScore}, смысловая точность ${scores.semanticScore}. ${verdict}`
  );
}

export function generateEvaluation(
  cardEvent: CardEventContract,
  etalon: Etalon,
  successCriteria: SuccessCriteria,
  options: GenerateEvaluationOptions = {},
): Evaluation {
  const grammarErrors = checkGrammarFields(cardEvent.enteredText);
  const time = scoreTime(cardEvent, options.timeNorms ?? resolveTimeNorms());
  const expected = getExpectedCardActions(etalon.expectedActions, cardEvent.cardId);
  const correctness = scoreCorrectness(expected, collectAttemptActions(cardEvent));
  const grammar = scoreGrammar(grammarErrors, successCriteria);
  const scores: AxisScores = {
    timeScore: time.score,
    correctnessScore: correctness.score,
    grammarScore: grammar.score,
    semanticScore: scoreSemantic(etalon.keyPhrases, cardEvent.enteredText),
  };
  const errors = [
    ...time.errors,
    ...correctness.errors,
    ...findMissingRequiredFields(cardEvent.enteredText, successCriteria),
    ...grammar.errors,
  ];
  const evaluation: Evaluation = {
    ...scores,
    totalScore: computeTotalScore(scores, options.weights),
    grammarErrors,
    errors,
    aiComment: buildAiComment(scores, errors.length + grammarErrors.length),
  };
  const teacherOverride = cardEvent.evaluation?.teacherOverride;
  return teacherOverride ? { ...evaluation, teacherOverride } : evaluation;
}

export type AttemptEvaluationSources = {
  sessions: readonly SessionContract[];
  scenarios: readonly Scenario[];
};

export type AttemptEvaluationLookup =
  | { status: "ready"; source: "stored" | "generated"; evaluation: Evaluation }
  | { status: "attemptNotFound" }
  | { status: "etalonNotFound" };

function findScenarioForCard(session: SessionContract, cardId: string, scenarios: readonly Scenario[]) {
  const ofSession = session.scenarioIds
    .map((id) => scenarios.find((scenario) => scenario.id === id))
    .find((scenario) => scenario?.cardIds.includes(cardId));
  return ofSession ?? scenarios.find((scenario) => scenario.cardIds.includes(cardId));
}

/**
 * Оценка попытки по CardEvent.id. Сценарий-эталон — первый из session.scenarioIds, содержащий карточку
 * (иначе — первый сценарий датасета с этой карточкой); нет эталона → etalonNotFound (для 404 evaluationPending).
 */
export function getAttemptEvaluation(
  cardEventId: string,
  sources: AttemptEvaluationSources,
): AttemptEvaluationLookup {
  const session = sources.sessions.find((item) =>
    item.cardEvents.some((attempt) => attempt.id === cardEventId),
  );
  const attempt = session?.cardEvents.find((item) => item.id === cardEventId);
  if (!session || !attempt) return { status: "attemptNotFound" };
  if (attempt.evaluation) return { status: "ready", source: "stored", evaluation: attempt.evaluation };
  const scenario = findScenarioForCard(session, attempt.cardId, sources.scenarios);
  if (!scenario) return { status: "etalonNotFound" };
  const evaluation = generateEvaluation(attempt, scenario.etalon, scenario.successCriteria, {
    timeNorms: resolveTimeNorms(scenario),
  });
  return { status: "ready", source: "generated", evaluation };
}
