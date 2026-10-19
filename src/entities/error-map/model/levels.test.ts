// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ERROR_MAP_COMPARISON_LABELS, ERROR_MAP_LEVEL_META, ERROR_MAP_LEVELS } from "./levels";

const TOKENS_CSS = readFileSync(join(__dirname, "../../../shared/ui/styles/tokens-platform.css"), "utf8");

describe("уровни карты ошибок", () => {
  it("порядок и слова уровней — как в спеке (FR-002)", () => {
    expect(ERROR_MAP_LEVELS).toEqual(["rare", "sometimes", "often", "noData"]);
    expect(ERROR_MAP_LEVELS.map((level) => ERROR_MAP_LEVEL_META[level].label)).toEqual([
      "редко",
      "иногда",
      "часто",
      "мало данных",
    ]);
  });

  it("у каждого уровня есть слово, значок и цветовой токен", () => {
    for (const level of ERROR_MAP_LEVELS) {
      const meta = ERROR_MAP_LEVEL_META[level];
      expect(meta.label.length, level).toBeGreaterThan(0);
      expect(meta.icon.length, level).toBeGreaterThan(0);
      expect(meta.colorToken, level).toMatch(/^--pf-[a-z-]+$/);
    }
  });

  it("значки — один символ и попарно различны", () => {
    const icons = ERROR_MAP_LEVELS.map((level) => ERROR_MAP_LEVEL_META[level].icon);
    for (const icon of icons) {
      expect([...icon]).toHaveLength(1);
    }
    expect(new Set(icons).size).toBe(ERROR_MAP_LEVELS.length);
  });

  it("цветовые токены уровней объявлены в tokens-platform.css и различны", () => {
    const tokens = ERROR_MAP_LEVELS.map((level) => ERROR_MAP_LEVEL_META[level].colorToken);
    for (const token of tokens) {
      expect(TOKENS_CSS, token).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
    }
    expect(new Set(tokens).size).toBe(ERROR_MAP_LEVELS.length);
  });
});

describe("подписи сравнения обучающегося с группой", () => {
  it("слова — «лучше группы», «как у группы», «хуже группы»", () => {
    expect(ERROR_MAP_COMPARISON_LABELS).toEqual({
      better: "лучше группы",
      same: "как у группы",
      worse: "хуже группы",
    });
  });
});
