import { MISTAKE_CATEGORY_ORDER } from "../config/evaluation";
import type { MistakeCategory, MistakeSeverity } from "../model/attempt";

const SEVERITIES: readonly string[] = ["critical", "major", "minor"];

/** ErrorSeverity мока → уровень для визуального различения; неизвестное значение → null. */
export function toMistakeSeverity(value: string): MistakeSeverity | null {
  return SEVERITIES.includes(value) ? (value as MistakeSeverity) : null;
}

/** Префиксы Evaluation.errors[].type → тип ошибки; всё прочее — ошибки заполнения. */
const CATEGORY_PREFIXES: [string, MistakeCategory][] = [
  ["time", "timing"],
  ["missed", "missedCall"],
  ["status", "statusSequence"],
  ["grammar", "grammar"],
];

export function getMistakeCategory(errorType: string): MistakeCategory {
  const match = CATEGORY_PREFIXES.find(([prefix]) => errorType.startsWith(prefix));
  return match ? match[1] : "filling";
}

type EvaluationErrors = {
  errors: { type: string }[];
  grammarErrors: unknown[];
};

/** Агрегация Evaluation.errors и grammarErrors по всем попыткам — по 5 типам спеки. */
export function countMistakesByCategory(evaluations: EvaluationErrors[]): Record<MistakeCategory, number> {
  const counts = Object.fromEntries(MISTAKE_CATEGORY_ORDER.map((category) => [category, 0])) as Record<
    MistakeCategory,
    number
  >;
  for (const evaluation of evaluations) {
    counts.grammar += evaluation.grammarErrors.length;
    for (const error of evaluation.errors) counts[getMistakeCategory(error.type)] += 1;
  }
  return counts;
}
