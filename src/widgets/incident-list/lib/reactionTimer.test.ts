import { describe, expect, it } from "vitest";

import { buildOpenedRecord, getReactionState } from "./reactionTimer";

const ISSUED = "2026-09-17T11:20:00+03:00";
const NORM_MS = 30_000;
const issuedMs = Date.parse(ISSUED);

describe("таймер первичной реакции 30 сек (T2.2-06)", () => {
  it("отсчёт от issuedAt, а не от рендера: 0:30 → 0:00, нарушение — строго после 30 сек", () => {
    expect(getReactionState(ISSUED, issuedMs, NORM_MS)).toEqual({ state: "new", timer: "0:30" });
    expect(getReactionState(ISSUED, issuedMs + 12_000, NORM_MS)).toEqual({ state: "new", timer: "0:18" });
    expect(getReactionState(ISSUED, issuedMs + 30_000, NORM_MS)).toEqual({ state: "new", timer: "0:00" });
    expect(getReactionState(ISSUED, issuedMs + 31_000, NORM_MS)).toEqual({
      state: "violation",
      timer: "0:00",
    });
  });

  it("primaryReactionMs = openedAt − issuedAt; нарушение — сверх норматива", () => {
    const base = { sessionId: "ses-1", cardId: "c-095", issuedAt: ISSUED };
    expect(buildOpenedRecord(base, "2026-09-17T11:20:18+03:00", NORM_MS)).toEqual({
      ...base,
      openedAt: "2026-09-17T11:20:18+03:00",
      primaryReactionMs: 18_000,
      isViolation: false,
    });
    expect(buildOpenedRecord(base, "2026-09-17T11:20:31+03:00", NORM_MS)).toMatchObject({
      primaryReactionMs: 31_000,
      isViolation: true,
    });
  });
});
