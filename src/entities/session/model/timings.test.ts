import { describe, expect, it } from "vitest";

import {
  DEFAULT_FULL_PROCESSING_MS,
  DEFAULT_PRIMARY_REACTION_MS,
  deviationMs,
  fullProcessingMs,
  isNormExceeded,
  primaryReactionMs,
  resolveTimeNorms,
} from "./timings";

const ISSUED_AT = "2026-09-16T10:02:00+03:00";

describe("метрики таймингов", () => {
  it("openedAt − issuedAt = 18 сек → 18000 мс, превышения при норме 30 сек нет", () => {
    const reactionMs = primaryReactionMs(ISSUED_AT, "2026-09-16T10:02:18+03:00");
    expect(reactionMs).toBe(18_000);
    expect(isNormExceeded(reactionMs, DEFAULT_PRIMARY_REACTION_MS)).toBe(false);
    expect(deviationMs(reactionMs, DEFAULT_PRIMARY_REACTION_MS)).toBe(-12_000);
  });

  it("31 сек → превышение; ровно 30_000 мс — не превышение", () => {
    expect(isNormExceeded(primaryReactionMs(ISSUED_AT, "2026-09-16T10:02:31+03:00"), 30_000)).toBe(true);
    expect(isNormExceeded(30_000, DEFAULT_PRIMARY_REACTION_MS)).toBe(false);
    expect(isNormExceeded(30_001, DEFAULT_PRIMARY_REACTION_MS)).toBe(true);
  });

  it("полная обработка совпадает с моком att-01 (178 000 мс)", () => {
    expect(fullProcessingMs("2026-09-16T10:02:14+03:00", "2026-09-16T10:05:12+03:00")).toBe(178_000);
    expect(isNormExceeded(180_000, DEFAULT_FULL_PROCESSING_MS)).toBe(false);
  });

  it("разница меток с +03:00 и Z не зависит от TZ процесса", () => {
    expect(primaryReactionMs(ISSUED_AT, "2026-09-16T07:02:18Z")).toBe(18_000);
    expect(primaryReactionMs("2026-09-16T23:59:50+03:00", "2026-09-17T00:00:10+03:00")).toBe(20_000);
  });

  it("некорректная метка → RangeError", () => {
    expect(() => primaryReactionMs("вчера", ISSUED_AT)).toThrow(RangeError);
  });
});

describe("resolveTimeNorms", () => {
  it("без сценария — дефолты заказчика 30 с / 180 с", () => {
    expect(resolveTimeNorms()).toEqual({ primaryReactionMs: 30_000, fullProcessingMs: 180_000 });
  });

  it("нормативы из Scenario.timeNorms (сек → мс)", () => {
    const scenario = { timeNorms: { primaryReactionSec: 20, fullProcessingSec: 240 } };
    expect(resolveTimeNorms(scenario)).toEqual({ primaryReactionMs: 20_000, fullProcessingMs: 240_000 });
  });

  it("переопределения занятия приоритетнее сценария, раздельно по нормативам", () => {
    const scenario = { timeNorms: { primaryReactionSec: 20, fullProcessingSec: 240 } };
    expect(resolveTimeNorms(scenario, { fullProcessingMs: 150_000 })).toEqual({
      primaryReactionMs: 20_000,
      fullProcessingMs: 150_000,
    });
  });
});
