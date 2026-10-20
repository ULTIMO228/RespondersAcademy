import { describe, expect, it } from "vitest";

import type { OperatorAttempt } from "@/shared/api";

import { CARD_TIMER_RED_SEC, cardTimer } from "./cardTimer";

const ANSWERED = "2026-09-29T10:00:00+03:00";
const answeredMs = Date.parse(ANSWERED);

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-1",
    cardId: "c-010",
    studentId: "u-005",
    aon: "9161263471",
    incidentNumber: 4,
    createdAt: ANSWERED,
    openedAt: ANSWERED,
    state: "answered",
    answeredAt: ANSWERED,
    events: [],
    replays: 0,
    hintsShown: 0,
    ...overrides,
  };
}

/** Момент через sec секунд после «Принять». */
const at = (sec: number) => answeredMs + sec * 1000;
const iso = (sec: number) => new Date(at(sec)).toISOString();

describe("cardTimer", () => {
  it("порог красного — 60 с (research R7a)", () => {
    expect(CARD_TIMER_RED_SEC).toBe(60);
  });

  it("до «Принять» таймера нет: answeredAt отсутствует → null", () => {
    expect(cardTimer(attempt({ state: "ringing", answeredAt: undefined }), at(9))).toBeNull();
  });

  it("КАРТОЧКА_1: 00:09, тёмный, идёт", () => {
    expect(cardTimer(attempt(), at(9))).toEqual({ text: "00:09", isRed: false, running: true });
  });

  it("граница включительно: 59 с — тёмный, 60 с — красный", () => {
    expect(cardTimer(attempt(), at(59))).toMatchObject({ text: "00:59", isRed: false });
    expect(cardTimer(attempt(), at(60))).toEqual({ text: "01:00", isRed: true, running: true });
  });

  it("КАРТОЧКА_2: 01:23 красный; КАРТОЧКА_3: 02:38 красный", () => {
    expect(cardTimer(attempt(), at(83))).toEqual({ text: "01:23", isRed: true, running: true });
    expect(cardTimer(attempt(), at(158))).toEqual({ text: "02:38", isRed: true, running: true });
  });

  it("минуты не обрезаются: 6000 с → 100:00", () => {
    expect(cardTimer(attempt(), at(6000))).toEqual({ text: "100:00", isRed: true, running: true });
  });

  it("после completedAt значение замирает на completedAt − answeredAt, running false, цвет сохраняется", () => {
    const stopped = attempt({ state: "submitted", completedAt: iso(83) });
    expect(cardTimer(stopped, at(500))).toEqual({ text: "01:23", isRed: true, running: false });
    expect(cardTimer(stopped, at(9000))).toEqual({ text: "01:23", isRed: true, running: false });
  });

  it("часы клиента «назад» относительно answeredAt → 00:00, не отрицательное", () => {
    expect(cardTimer(attempt(), answeredMs - 5000)).toEqual({ text: "00:00", isRed: false, running: true });
  });
});
