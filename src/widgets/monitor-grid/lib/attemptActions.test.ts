/* T3.3-08: действия попытки в терминах эталона; T3.3-03: живое время от старта занятия. */
import { describe, expect, it } from "vitest";

import type { CardEventContract } from "@/shared/api";

import { buildAttemptActions } from "./attemptActions";
import { formatElapsed } from "./formatElapsed";

const attempt = {
  id: "att-1",
  cardId: "c-095",
  studentId: "u-005",
  openedAt: "2026-09-17T11:20:09+03:00",
  primaryReactionMs: 9000,
  statuses: [
    { ddsStatus: "accepted", at: "2026-09-17T11:20:23+03:00" },
    { ddsStatus: "workDone", at: "2026-09-17T11:22:20+03:00" },
  ],
  servicesCalled: [],
  completedAt: "",
  fullProcessingMs: 0,
  enteredText: {},
  calls: [
    { toNumber: "102", startedAt: "2026-09-17T11:21:02+03:00", transcript: [] },
    { toNumber: "103", startedAt: "2026-09-17T11:21:48+03:00", transcript: [] },
  ],
} as unknown as CardEventContract;

describe("buildAttemptActions", () => {
  it("открытие, статусы и вызовы точки C — одной хронологией", () => {
    expect(buildAttemptActions(attempt).map((item) => item.action)).toEqual([
      "openCard:c-095",
      "status:accepted",
      "call:102",
      "call:103",
      "status:workDone",
    ]);
  });
});

describe("formatElapsed", () => {
  it("минуты до часа, часы — дальше", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(125_000)).toBe("02:05");
    expect(formatElapsed(3_600_000)).toBe("1:00:00");
    expect(formatElapsed(-1000)).toBe("00:00");
  });
});
