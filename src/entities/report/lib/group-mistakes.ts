/*
 * «Мои ошибки» (T2.5-04): агрегация Evaluation.errors и grammarErrors по всем попыткам курсанта,
 * группировка по 5 типам спеки (тайминг / заполнение / грамматика / последовательность статусов /
 * пропущенный звонок). Пустые группы сохраняются (счётчик 0) — порядок MISTAKE_CATEGORY_ORDER.
 */
import { MISTAKE_CATEGORY_ORDER } from "../config/evaluation";
import type { MistakeCategory, MistakeGroup } from "../model/attempt";
import { getMistakeCategory, toMistakeSeverity } from "./mistakes";

export type MistakeSource = {
  attemptId: string;
  cardNumber: string;
  evaluation: {
    errors: { type: string; severity: string; message: string }[];
    grammarErrors: { fragment: string; wrong: string; expected: string }[];
  };
};

function createEmptyGroups(): Record<MistakeCategory, MistakeGroup> {
  return Object.fromEntries(
    MISTAKE_CATEGORY_ORDER.map((category) => [category, { category, count: 0, examples: [] }]),
  ) as unknown as Record<MistakeCategory, MistakeGroup>;
}

export function groupMistakes(sources: MistakeSource[]): MistakeGroup[] {
  const groups = createEmptyGroups();
  for (const { attemptId, cardNumber, evaluation } of sources) {
    evaluation.errors.forEach((error, index) => {
      const group = groups[getMistakeCategory(error.type)];
      group.count += 1;
      group.examples.push({
        key: `${attemptId}-e${index}`,
        cardNumber,
        severity: toMistakeSeverity(error.severity),
        message: error.message,
      });
    });
    evaluation.grammarErrors.forEach(({ fragment, wrong, expected }, index) => {
      groups.grammar.count += 1;
      groups.grammar.examples.push({
        key: `${attemptId}-g${index}`,
        cardNumber,
        severity: null,
        message: fragment,
        grammar: { fragment, wrong, expected },
      });
    });
  }
  return MISTAKE_CATEGORY_ORDER.map((category) => groups[category]);
}
