import { describe, expect, it } from "vitest";

import { generateEvaluation } from "@/entities/report";
import { scenarios, sessions } from "@/shared/api";
import type { CardEventContract, SessionContract } from "@/shared/api";

import {
  buildCardCallRequest,
  collectCallLog,
  finishCall,
  getCallDurationMs,
  toMoscowIso,
} from "./phoneCall";

const STARTED_AT = Date.parse("2026-09-17T11:21:00+03:00");
const LINES = [
  { speaker: "ai" as const, text: "Слушаю вас", at: "2026-09-17T11:21:02+03:00" },
  { speaker: "dispatcher" as const, text: "ДТП, Волгоградский проспект", at: "2026-09-17T11:21:10+03:00" },
  { speaker: "ai" as const, text: "Я вас понял, информация принята", at: "2026-09-17T11:21:12+03:00" },
];

describe("сборка PhoneCall", () => {
  it("toMoscowIso — формат мок-слоя +03:00", () => {
    expect(toMoscowIso(Date.parse("2026-09-17T08:20:00Z"))).toBe("2026-09-17T11:20:00+03:00");
  });

  it("finishCall + buildCardCallRequest: fromUserId, toNumber, startedAt/endedAt, transcript", () => {
    const call = finishCall(
      { number: "103", subscriberTitle: "СМП" },
      STARTED_AT,
      STARTED_AT + 48_000,
      LINES,
    );
    expect(buildCardCallRequest(call, "u-005")).toEqual({
      studentId: "u-005",
      toNumber: "103",
      startedAt: "2026-09-17T11:21:00+03:00",
      endedAt: "2026-09-17T11:21:48+03:00",
      transcript: LINES,
    });
    expect(getCallDurationMs(call)).toBe(48_000);
  });

  it("транскрипт иммутабелен после завершения", () => {
    const call = finishCall({ number: "103", subscriberTitle: "СМП" }, STARTED_AT, STARTED_AT, LINES);
    expect(Object.isFrozen(call.transcript)).toBe(true);
    expect(Object.isFrozen(call.transcript[0])).toBe(true);
  });

  it("журнал: вызовы попыток курсанта из занятий, новые сверху", () => {
    const log = collectCallLog(sessions as unknown as SessionContract[], "u-005", []);
    expect(log.map((entry) => [entry.number, entry.cardId])).toEqual([
      ["302", "c-093"],
      ["301", "c-063"],
    ]);
  });

  it("пропуск ожидаемого звонка попадает в Evaluation (missedRequiredCall), выполненный — нет", () => {
    const scenario = scenarios.find((candidate) => candidate.cardIds.includes("c-095"));
    if (!scenario) throw new Error("нет сценария c-095");
    const call = finishCall({ number: "103", subscriberTitle: "СМП" }, STARTED_AT, STARTED_AT + 1000, LINES);
    const { studentId, ...phoneCall } = buildCardCallRequest(call, "u-005");
    const attempt: CardEventContract = {
      id: "att-test",
      cardId: "c-095",
      studentId,
      openedAt: "2026-09-17T11:20:10+03:00",
      primaryReactionMs: 10_000,
      statuses: [{ ddsStatus: "accepted", at: "2026-09-17T11:20:20+03:00" }],
      servicesCalled: [],
      completedAt: "2026-09-17T11:22:00+03:00",
      fullProcessingMs: 110_000,
      enteredText: {},
      calls: [{ ...phoneCall, fromUserId: studentId }],
    };
    const missed = generateEvaluation(attempt, scenario.etalon, scenario.successCriteria)
      .errors.filter((error) => error.type === "missedRequiredCall")
      .map((error) => error.message);
    expect(missed).toEqual([
      "Пропущен ожидаемый звонок точке C (102)",
      "Пропущен ожидаемый звонок точке C (101)",
    ]);
  });
});
