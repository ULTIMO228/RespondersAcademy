import { describe, expect, it } from "vitest";

import type { Evaluation, OperatorEvaluation } from "@/shared/api";

import { formatDiffValue, fromDdsEvaluation, fromOperatorEvaluation } from "./normalize";

const OPERATOR: OperatorEvaluation = {
  timeScore: 90,
  correctnessScore: 80,
  grammarScore: 100,
  semanticScore: 70,
  totalScore: 85,
  grammarErrors: [],
  errors: [{ type: "addressMissing", message: "Не указан номер дома", severity: "major" }, { foo: 1 }],
  aiComment: "Уточняйте адрес",
  fieldDiff: [{ field: "address", entered: "Москва", expected: "Москва, 14", ok: false }],
  mode: "operator112",
  assessorVersion: "operator112-v3",
  passed: true,
};

const DDS: Evaluation = {
  status: "final",
  timeScore: 70,
  correctnessScore: 60,
  grammarScore: 90,
  semanticScore: 80,
  totalScore: 75,
  grammarErrors: [
    { field: "dispatcherText", fragment: "пренято", wrong: "пренято", expected: "принято", type: "spelling" },
  ],
  errors: [{ type: "timeExceeded", severity: "major", message: "Превышено время реакции" }],
  aiComment: "Следите за временем",
};

describe("fromOperatorEvaluation", () => {
  it("оси, ошибки одной строкой, различия с эталоном, версия оценщика и вердикт экзамена", () => {
    const model = fromOperatorEvaluation(OPERATOR);
    expect(model.totalScore).toBe(85);
    expect(model.axes.semanticScore).toBe(70);
    expect(model.errors[0]).toEqual({
      type: "addressMissing",
      message: "Не указан номер дома",
      severity: "major",
    });
    expect(model.errors[1].message).toBe("Ошибка без описания");
    expect(model.fieldDiff).toHaveLength(1);
    expect(model.assessorVersion).toBe("operator112-v3");
    expect(model.passed).toBe(true);
    expect(model.reviewPending).toBe(false);
  });
});

describe("fromDdsEvaluation", () => {
  it("грамматические замечания становятся ошибками; различий с эталоном нет", () => {
    const model = fromDdsEvaluation(DDS);
    expect(model.fieldDiff).toBeNull();
    expect(model.errors.map((error) => error.message)).toEqual([
      "Превышено время реакции",
      "Грамматика (dispatcherText): «пренято» → «принято»",
    ]);
  });

  it("решение преподавателя имеет приоритет: итог берётся из teacherOverride", () => {
    const model = fromDdsEvaluation({
      ...DDS,
      teacherOverride: {
        score: 88,
        comment: "Хорошо",
        at: "2026-09-29T10:00:00+03:00",
        by: "Морозова Е. С.",
      },
    });
    expect(model.totalScore).toBe(88);
    expect(model.teacherOverride).toMatchObject({ comment: "Хорошо", by: "Морозова Е. С." });
  });

  it("предварительная оценка и «нужна проверка» помечаются как ожидающие", () => {
    expect(fromDdsEvaluation({ ...DDS, status: "review_required" }).reviewPending).toBe(true);
    expect(fromDdsEvaluation({ ...DDS, status: "preliminary" }).reviewPending).toBe(true);
    expect(fromDdsEvaluation({ ...DDS, status: "final" }).reviewPending).toBe(false);
  });
});

describe("formatDiffValue", () => {
  it("пусто → «—», объекты → JSON", () => {
    expect(formatDiffValue(null)).toBe("—");
    expect(formatDiffValue("")).toBe("—");
    expect(formatDiffValue(14)).toBe("14");
    expect(formatDiffValue({ a: 1 })).toBe('{"a":1}');
  });
});
