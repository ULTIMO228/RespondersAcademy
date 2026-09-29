import { describe, expect, it } from "vitest";

import type { Analytics, Stats } from "@/shared/api";

import { toDayLabel, toDynamics, toModeTimes } from "./series";

const stats = (count: number, reaction = 0, processing = 0): Stats => ({
  count,
  averageScore: 80,
  averageReactionMs: reaction,
  averageProcessingMs: processing,
  replays: 0,
  hintsShown: 0,
});

function analytics(overrides: Partial<Analytics> = {}): Analytics {
  return {
    byMode: { dds: stats(0), operator112: stats(2, 24_400, 150_000) },
    reactionMs: 24_400,
    topErrors: [{ type: "addressMissing", count: 3 }],
    dynamics: { labels: ["2026-09-25", "2026-09-27", "2026-09-28"], values: [70, 80, 90] },
    byGroup: {},
    byFormat: { training: stats(2), exam: stats(0) },
    ...overrides,
  };
}

describe("форма analytics.dynamics/topErrors (слабо типизирована — фиксируем тестом)", () => {
  it("метки-даты укорачиваются до дд.мм, значения сохраняются", () => {
    expect(toDynamics(analytics())).toEqual({ labels: ["25.09", "27.09", "28.09"], values: [70, 80, 90] });
  });

  it("не даты остаются как есть; неравные длины обрезаются до меньшей", () => {
    expect(toDayLabel("Попытка 1")).toBe("Попытка 1");
    expect(toDynamics(analytics({ dynamics: { labels: ["2026-09-25", "b"], values: [70] } }))).toEqual({
      labels: ["25.09"],
      values: [70],
    });
  });

  it("пустая динамика — пустые ряды", () => {
    expect(toDynamics(analytics({ dynamics: { labels: [], values: [] } }))).toEqual({
      labels: [],
      values: [],
    });
  });

  it("время по режимам: только режимы с попытками, секунды округлены", () => {
    expect(toModeTimes(analytics())).toEqual({
      labels: ["Режим 112"],
      reactionSec: [24],
      processingSec: [150],
    });
  });
});
