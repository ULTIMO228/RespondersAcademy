import { describe, expect, it } from "vitest";

import type { OperatorAttempt } from "@/shared/api";

import { answerWait, examRemainingSec, formatClock, processingWait, talkSeconds } from "./timers";
import { resolveNorms, resolveTimeLimitSec } from "./norms";

const OPENED = "2026-09-29T10:00:00+03:00";
const openedMs = Date.parse(OPENED);

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-1",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: OPENED,
    openedAt: OPENED,
    state: "ringing",
    events: [],
    replays: 0,
    hintsShown: 0,
    ...overrides,
  };
}

describe("нормативы попытки", () => {
  it("по умолчанию — 30 сек реакция и 180 сек отработка; берутся из params.norms", () => {
    expect(resolveNorms()).toEqual({ answerSec: 30, submitSec: 180 });
    expect(resolveNorms({ norms: { answerSec: 20, submitSec: 120 } })).toEqual({
      answerSec: 20,
      submitSec: 120,
    });
  });

  it("нулевые и отрицательные нормативы игнорируются", () => {
    expect(resolveNorms({ norms: { answerSec: 0, submitSec: -5 } })).toEqual({
      answerSec: 30,
      submitSec: 180,
    });
  });

  it("лимит экзамена — только положительное число", () => {
    expect(resolveTimeLimitSec({ timeLimitSec: 600 })).toBe(600);
    expect(resolveTimeLimitSec({ timeLimitSec: 0 })).toBeNull();
    expect(resolveTimeLimitSec({})).toBeNull();
  });
});

describe("ожидание ответа", () => {
  it("идёт от поступления вызова, остаток убывает, превышение — после нормы", () => {
    expect(answerWait(attempt(), 30, openedMs + 12_400)).toEqual({
      elapsedSec: 12,
      normSec: 30,
      remainingSec: 18,
      exceeded: false,
    });
    expect(answerWait(attempt(), 30, openedMs + 30_000).exceeded).toBe(false);
    const late = answerWait(attempt(), 30, openedMs + 41_000);
    expect(late).toMatchObject({ elapsedSec: 41, remainingSec: 0, exceeded: true });
  });

  it("после «Ответить» значение замирает на серверном answeredAt", () => {
    const answered = attempt({ state: "answered", answeredAt: "2026-09-29T10:00:07+03:00" });
    expect(answerWait(answered, 30, openedMs + 300_000).elapsedSec).toBe(7);
  });

  it("часы клиента позади серверных меток не дают отрицательных значений", () => {
    expect(answerWait(attempt(), 30, openedMs - 5000).elapsedSec).toBe(0);
  });
});

describe("разговор и отработка", () => {
  it("до ответа разговора нет; после — от answeredAt до «сейчас», после передачи — до completedAt", () => {
    expect(talkSeconds(attempt(), openedMs + 50_000)).toBe(0);
    const answered = attempt({ state: "answered", answeredAt: "2026-09-29T10:00:10+03:00" });
    expect(talkSeconds(answered, openedMs + 70_000)).toBe(60);
    const done = { ...answered, state: "submitted" as const, completedAt: "2026-09-29T10:01:40+03:00" };
    expect(talkSeconds(done, openedMs + 999_000)).toBe(90);
  });

  it("полная отработка сравнивается с нормативом 3 мин", () => {
    expect(processingWait(attempt(), 180, openedMs + 179_000).exceeded).toBe(false);
    expect(processingWait(attempt(), 180, openedMs + 181_000)).toMatchObject({
      exceeded: true,
      remainingSec: 0,
    });
  });
});

describe("лимит экзамена на попытку", () => {
  it("openedAt + лимит − now; на нуле остаётся 0, а не минус", () => {
    expect(examRemainingSec(attempt(), 600, openedMs + 100_000)).toBe(500);
    expect(examRemainingSec(attempt(), 600, openedMs + 700_000)).toBe(0);
  });

  it("нет лимита или карточка передана — индикатора нет", () => {
    expect(examRemainingSec(attempt(), null, openedMs)).toBeNull();
    expect(examRemainingSec(attempt({ state: "submitted" }), 600, openedMs)).toBeNull();
  });
});

describe("formatClock", () => {
  it("мм:сс с ведущими нулями", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(-3)).toBe("00:00");
  });
});
