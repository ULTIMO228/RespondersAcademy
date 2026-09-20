/* Веса критериев интегрального балла (T3.4-08): пересчёт итога и валидация суммы 100 %. */
import { describe, expect, it } from "vitest";

import { computeTotalScore } from "./evaluate";
import {
  DEFAULT_WEIGHT_PERCENTS,
  getWeightsSum,
  isWeightsSumValid,
  SCORE_AXES,
  WEIGHTS_TOTAL_PERCENT,
} from "./score-weights";

const SCORES = { timeScore: 60, correctnessScore: 100, grammarScore: 40, semanticScore: 80 };

describe("веса критериев", () => {
  it("дефолт даёт 100 % и покрывает все четыре оси расшифровки балла", () => {
    expect(getWeightsSum(DEFAULT_WEIGHT_PERCENTS)).toBe(WEIGHTS_TOTAL_PERCENT);
    expect(isWeightsSumValid(DEFAULT_WEIGHT_PERCENTS)).toBe(true);
    expect(SCORE_AXES.map((axis) => axis.key)).toEqual(Object.keys(DEFAULT_WEIGHT_PERCENTS));
  });

  it("сумма не равна 100 % → веса невалидны", () => {
    expect(isWeightsSumValid({ ...DEFAULT_WEIGHT_PERCENTS, grammarScore: 30 })).toBe(false);
    expect(isWeightsSumValid({ ...DEFAULT_WEIGHT_PERCENTS, grammarScore: 0 })).toBe(false);
  });

  it("повышение веса грамматики опускает итог (пересчёт на лету)", () => {
    // 60·0,3 + 100·0,3 + 40·0,2 + 80·0,2 = 72
    expect(computeTotalScore(SCORES, DEFAULT_WEIGHT_PERCENTS)).toBe(72);
    // грамматика 50 %, остальные по 20/20/10: 60·0,2 + 100·0,2 + 40·0,5 + 80·0,1 = 60
    const grammarHeavy = {
      timeScore: 20,
      correctnessScore: 20,
      grammarScore: 50,
      semanticScore: 10,
    };
    expect(getWeightsSum(grammarHeavy)).toBe(WEIGHTS_TOTAL_PERCENT);
    expect(computeTotalScore(SCORES, grammarHeavy)).toBe(60);
  });
});
