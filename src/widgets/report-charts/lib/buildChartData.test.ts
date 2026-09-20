/* Данные чартов отчёта (T3.4-12…15): нормализация интенсивности heatmap и поведение на пустых данных. */
import { describe, expect, it } from "vitest";

import { HEAT_LEVEL_MAX } from "../config/charts";
import {
  buildDynamics,
  buildHeatRows,
  buildScoreByStudent,
  buildStageSeries,
  getHeatLevel,
  hasAnyError,
} from "./buildChartData";

describe("нормализация тепловой карты", () => {
  it("уровень = числу ошибок, но не ниже 0 и не выше верхней ступени шкалы", () => {
    expect([0, 1, 2, 3, 7, -1].map(getHeatLevel)).toEqual([0, 1, 2, 3, HEAT_LEVEL_MAX, 0]);
  });

  it("нулевые ошибки → карта считается пустой", () => {
    expect(hasAnyError([{ id: "r", label: "К", cells: [{ key: "spelling", value: 0, level: 0 }] }])).toBe(
      false,
    );
    expect(hasAnyError([{ id: "r", label: "К", cells: [{ key: "spelling", value: 2, level: 2 }] }])).toBe(
      true,
    );
  });
});

describe("пустые данные", () => {
  it("без отчётов серии пустые, средний балл 0, строк карты нет", () => {
    expect(buildStageSeries([])).toEqual({
      labels: [],
      reactionSec: [],
      processingSec: [],
      reactionNormSec: 0,
      processingNormSec: 0,
    });
    expect(buildDynamics([])).toEqual({ labels: [], scores: [], averageLine: [], average: 0 });
    expect(buildHeatRows([])).toEqual([]);
    expect(buildScoreByStudent([])).toEqual({ labels: [], values: [] });
  });
});
