/*
 * Конфиг мок-оценки попытки (T1.2-08). Веса осей интегрального балла настраивает преподаватель;
 * дефолт — равные веса (spec/12-tasks.md T1.2-08). Остальные константы — параметры мок-модели ИИ.
 */
import type { Evaluation } from "@/shared/api";

export type ScoreAxis = keyof Pick<
  Evaluation,
  "timeScore" | "correctnessScore" | "grammarScore" | "semanticScore"
>;

export type ScoreWeights = Record<ScoreAxis, number>;

/** Веса настраивает преподаватель; по умолчанию все оси равнозначны. */
export const DEFAULT_SCORE_WEIGHTS: Readonly<ScoreWeights> = {
  timeScore: 1,
  correctnessScore: 1,
  grammarScore: 1,
  semanticScore: 1,
};

/** Шкала каждой оси и итога — 0..100. */
export const MIN_SCORE = 0;
export const MAX_SCORE = 100;

/** Порядок и подписи критериев расшифровки балла (spec/04-pages/13 п. 3). */
export const SCORE_AXES: readonly { key: ScoreAxis; title: string }[] = [
  { key: "timeScore", title: "Время" },
  { key: "correctnessScore", title: "Корректность" },
  { key: "grammarScore", title: "Грамматика" },
  { key: "semanticScore", title: "Смысл" },
];

/** Сумма весов в процентах, которую валидирует форма преподавателя (T3.4-08). */
export const WEIGHTS_TOTAL_PERCENT = 100;

/**
 * Веса по умолчанию в процентах (Q&A в5 — на усмотрение команды): время и корректность весомее
 * грамматики и смысловой точности. computeTotalScore нормирует их на сумму, поэтому проценты
 * подставляются как веса напрямую.
 */
export const DEFAULT_WEIGHT_PERCENTS: Readonly<ScoreWeights> = {
  timeScore: 30,
  correctnessScore: 30,
  grammarScore: 20,
  semanticScore: 20,
};

export function getWeightsSum(weights: Readonly<ScoreWeights>): number {
  return SCORE_AXES.reduce((sum, axis) => sum + weights[axis.key], 0);
}

/** Веса принимаются, только если в сумме дают 100 % (иначе балл считать нельзя). */
export function isWeightsSumValid(weights: Readonly<ScoreWeights>): boolean {
  return getWeightsSum(weights) === WEIGHTS_TOTAL_PERCENT;
}

/** Доля timeScore на каждый из двух нормативов (первичная реакция / полная обработка). */
export const TIME_NORM_SHARE = 0.5;

/** Штраф за грамматическую ошибку в пределах successCriteria.maxGrammarErrors и сверх него. */
export const GRAMMAR_PENALTY_WITHIN_LIMIT = 10;
export const GRAMMAR_PENALTY_OVER_LIMIT = 30;

/** Смысловое сравнение: слова короче порога не учитываются, слова сравниваются по основе фиксированной длины. */
export const SEMANTIC_MIN_WORD_LENGTH = 3;
export const SEMANTIC_STEM_LENGTH = 5;
