import { describe, expect, it } from "vitest";

import type { Analytics, Stats } from "@/shared/api";

import {
  describeErrorType,
  formatSecondsShort,
  PROCESSING_NORM_LABEL,
  REACTION_NORM_LABEL,
  summarizePerformance,
  toneAgainstNorm,
} from "./analytics";

const stats = (
  count: number,
  averageScore: number,
  averageReactionMs: number,
  averageProcessingMs: number,
): Stats => ({
  count,
  averageScore,
  averageReactionMs,
  averageProcessingMs,
  replays: 0,
  hintsShown: 0,
});

function analytics(byMode: Analytics["byMode"]): Analytics {
  return {
    byMode,
    reactionMs: 0,
    topErrors: [],
    dynamics: { labels: [], values: [] },
    byGroup: {},
    byFormat: { training: stats(0, 0, 0, 0), exam: stats(0, 0, 0, 0) },
  };
}

describe("summarizePerformance", () => {
  it("средние взвешены числом попыток режимов", () => {
    const summary = summarizePerformance(
      analytics({ dds: stats(1, 60, 40_000, 200_000), operator112: stats(3, 100, 20_000, 160_000) }),
    );
    expect(summary).toEqual({ attempts: 4, averageScore: 90, reactionMs: 25_000, processingMs: 170_000 });
  });

  it("без попыток — null, а не 0: пустой кабинет не показывает «реакцию 0 с»", () => {
    const summary = summarizePerformance(
      analytics({ dds: stats(0, 0, 0, 0), operator112: stats(0, 0, 0, 0) }),
    );
    expect(summary).toEqual({ attempts: 0, averageScore: null, reactionMs: null, processingMs: null });
  });

  it("режим без попыток не разбавляет среднее нулями", () => {
    const summary = summarizePerformance(
      analytics({ dds: stats(0, 0, 0, 0), operator112: stats(2, 80, 24_000, 170_000) }),
    );
    expect(summary.averageScore).toBe(80);
    expect(summary.reactionMs).toBe(24_000);
  });
});

describe("нормативы", () => {
  it("тон против норматива: не больше — good, больше — bad, нет данных — default", () => {
    expect(toneAgainstNorm(30_000, 30_000)).toBe("good");
    expect(toneAgainstNorm(30_001, 30_000)).toBe("bad");
    expect(toneAgainstNorm(null, 30_000)).toBe("default");
  });

  it("подписи нормативов АРМ: 30 с и 3 мин", () => {
    expect(REACTION_NORM_LABEL).toBe("норматив 30 с");
    expect(PROCESSING_NORM_LABEL).toBe("норматив 3 мин");
    expect(formatSecondsShort(24_300)).toBe("24 с");
  });

  it("тип ошибки: категория спеки и исходный код", () => {
    expect(describeErrorType("timeExceeded")).toBe("Тайминг · timeExceeded");
    expect(describeErrorType("addressMissing")).toBe("Заполнение · addressMissing");
  });
});
