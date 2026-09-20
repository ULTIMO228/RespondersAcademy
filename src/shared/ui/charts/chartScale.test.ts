/* Шкалы примитивов SVG-чартов (T3.4-12): ось Y всегда от нуля (ТЗ §17), нулевые и пустые данные не ломают. */
import { describe, expect, it } from "vitest";

import { DEFAULT_BOX, getNiceMax, getTicks, scaleY } from "./chartScale";

describe("chartScale", () => {
  it("округляет максимум вверх до «красивого» значения и всегда начинает с нуля", () => {
    expect(getNiceMax(232)).toBeGreaterThanOrEqual(232);
    expect(getTicks(getNiceMax(232))[0]).toBe(0);
    expect(getTicks(getNiceMax(100))).toHaveLength(5);
  });

  it("нулевые и пустые данные дают ненулевую шкалу без NaN", () => {
    expect(getNiceMax(0)).toBe(1);
    expect(getNiceMax(Math.max(...[], 0))).toBe(1);
    // Math.max() пустого массива — -Infinity: шкала остаётся конечной.
    expect(getNiceMax(Math.max(...([] as number[])))).toBe(1);
    expect(Number.isFinite(scaleY(0, getNiceMax(0), DEFAULT_BOX))).toBe(true);
  });

  it("значение 0 лежит на базовой линии, максимум — на верхней границе поля", () => {
    const niceMax = getNiceMax(180);
    const base = scaleY(0, niceMax, DEFAULT_BOX);
    expect(base).toBe(DEFAULT_BOX.height - DEFAULT_BOX.padBottom);
    expect(scaleY(niceMax, niceMax, DEFAULT_BOX)).toBe(DEFAULT_BOX.padTop);
    // Вдвое больший факт — вдвое выше столбик: диаграмма не искажает пропорции.
    const half = base - scaleY(niceMax / 2, niceMax, DEFAULT_BOX);
    expect(base - scaleY(niceMax, niceMax, DEFAULT_BOX)).toBeCloseTo(half * 2);
  });
});
