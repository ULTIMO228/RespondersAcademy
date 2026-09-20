export { AttemptRow } from "./ui/AttemptRow";
export { SeverityMark } from "./ui/SeverityMark";
export { buildAttemptView, getAttemptScore } from "./lib/buildAttemptView";
export type { AttemptEvaluationView, AttemptSource } from "./lib/buildAttemptView";
export { summarizeProgress } from "./lib/aggregates";
export type { AttemptMetrics } from "./lib/aggregates";
export { groupMistakes } from "./lib/group-mistakes";
export type { MistakeSource } from "./lib/group-mistakes";
export { countMistakesByCategory, getMistakeCategory } from "./lib/mistakes";
export {
  EVALUATION_CRITERIA,
  MISTAKE_CATEGORY_ORDER,
  MISTAKE_CATEGORY_SHORT_TITLES,
  MISTAKE_CATEGORY_TITLES,
  PROCESSING_NORM_MS,
  REACTION_NORM_MS,
  SEVERITY_TITLES,
} from "./config/evaluation";
export { GRAMMAR_ERROR_SEVERITY, SEVERITY_ORDER, SEVERITY_RULES } from "./config/evaluation";
export type { AttemptView, MistakeCategory, MistakeExample, MistakeGroup } from "./model/attempt";
export type { MistakeSeverity, ProgressNorms, ProgressSummaryData, TeacherOverride } from "./model/attempt";
export {
  AI_COMMENT_PREFIX,
  computeTotalScore,
  generateEvaluation,
  getAttemptEvaluation,
} from "./model/evaluate";
export type {
  AttemptEvaluationLookup,
  AttemptEvaluationSources,
  GenerateEvaluationOptions,
} from "./model/evaluate";
export { DEFAULT_SCORE_WEIGHTS, DEFAULT_WEIGHT_PERCENTS, getWeightsSum } from "./model/score-weights";
export { isWeightsSumValid, SCORE_AXES, WEIGHTS_TOTAL_PERCENT } from "./model/score-weights";
export type { ScoreAxis, ScoreWeights } from "./model/score-weights";
