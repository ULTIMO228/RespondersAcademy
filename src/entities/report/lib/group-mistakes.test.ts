import { describe, expect, it } from "vitest";

import { MISTAKE_CATEGORY_ORDER } from "../config/evaluation";
import { groupMistakes } from "./group-mistakes";
import type { MistakeSource } from "./group-mistakes";

/** Оценка att-03 (курсант u-006) из mocks/sessions.json. */
const FAILED: MistakeSource = {
  attemptId: "att-03",
  cardNumber: "36814852",
  evaluation: {
    errors: [
      { type: "timeReactionExceeded", severity: "major", message: "Реакция 48 с при нормативе 30 с" },
      { type: "timeProcessingExceeded", severity: "major", message: "Отработка 310 с при нормативе 180 с" },
      { type: "missedRequiredCall", severity: "critical", message: "Пропущен ожидаемый звонок в службу" },
      { type: "statusOrderViolated", severity: "minor", message: "Статус пропущен" },
      { type: "requiredFieldEmpty", severity: "unknown", message: "Не заполнено поле" },
    ],
    grammarErrors: [{ fragment: "сообщение пренято", wrong: "пренято", expected: "принято" }],
  },
};

describe("groupMistakes", () => {
  it("группирует по 5 типам спеки в порядке вывода, с примерами и тяжестью", () => {
    const groups = groupMistakes([FAILED]);
    expect(groups.map((group) => group.category)).toEqual(MISTAKE_CATEGORY_ORDER);
    expect(Object.fromEntries(groups.map((group) => [group.category, group.count]))).toEqual({
      timing: 2,
      filling: 1,
      grammar: 1,
      statusSequence: 1,
      missedCall: 1,
    });
    const missed = groups.find((group) => group.category === "missedCall");
    expect(missed?.examples[0]).toMatchObject({ cardNumber: "36814852", severity: "critical" });
    expect(groups.find((group) => group.category === "filling")?.examples[0].severity).toBeNull();
  });

  it("грамматика: фрагмент, ошибка и эталон", () => {
    const grammar = groupMistakes([FAILED]).find((group) => group.category === "grammar");
    expect(grammar?.examples[0].grammar).toEqual({
      fragment: "сообщение пренято",
      wrong: "пренято",
      expected: "принято",
    });
  });

  it("без ошибок — все 5 групп пустые (счётчик 0)", () => {
    const groups = groupMistakes([
      { attemptId: "att-01", cardNumber: "1", evaluation: { errors: [], grammarErrors: [] } },
    ]);
    expect(groups).toHaveLength(5);
    expect(groups.every((group) => group.count === 0 && group.examples.length === 0)).toBe(true);
    expect(groupMistakes([])).toHaveLength(5);
  });
});
