import { describe, expect, it } from "vitest";

import { summarizeProgress } from "./aggregates";
import type { AttemptMetrics } from "./aggregates";

const NORMS = { reactionMs: 30_000, processingMs: 180_000 };

/** att-01, att-02 курсанта u-005 из mocks/sessions.json; Report.score = 96 (reports.json). */
const OWN_ATTEMPTS: AttemptMetrics[] = [
  {
    openedAt: "2026-09-16T10:02:14+03:00",
    primaryReactionMs: 14_000,
    fullProcessingMs: 178_000,
    score: 98,
    mistakeCount: 0,
  },
  {
    openedAt: "2026-09-16T10:06:52+03:00",
    primaryReactionMs: 22_000,
    fullProcessingMs: 232_000,
    score: 95,
    mistakeCount: 0,
  },
];

describe("summarizeProgress", () => {
  it("средние, число карточек и доля без ошибок совпадают с ручным расчётом по мокам", () => {
    expect(summarizeProgress(OWN_ATTEMPTS, [96], NORMS)).toEqual({
      periodFrom: "2026-09-16T10:02:14+03:00",
      periodTo: "2026-09-16T10:06:52+03:00",
      integralScore: 96,
      averageReactionMs: 18_000,
      averageProcessingMs: 205_000,
      cardCount: 2,
      errorFreePercent: 100,
      norms: NORMS,
    });
  });

  it("доля без ошибок учитывает попытки с ошибками; без отчётов балл — среднее попыток", () => {
    const withMistake = [...OWN_ATTEMPTS, { ...OWN_ATTEMPTS[0], score: 66, mistakeCount: 5 }];
    const summary = summarizeProgress(withMistake, [], NORMS);
    expect(summary.errorFreePercent).toBe(67);
    expect(summary.integralScore).toBe(86);
  });

  it("пустая история → null-значения («—») и 0 карточек", () => {
    expect(summarizeProgress([], [], NORMS)).toEqual({
      periodFrom: null,
      periodTo: null,
      integralScore: null,
      averageReactionMs: null,
      averageProcessingMs: null,
      cardCount: 0,
      errorFreePercent: null,
      norms: NORMS,
    });
  });
});
