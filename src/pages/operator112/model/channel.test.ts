import { describe, expect, it } from "vitest";

import type { OperatorAttempt } from "@/shared/api";

import { attemptChannel, attemptSmsText } from "./channel";

const OPENED = "2026-10-20T10:00:00+03:00";

function attempt(overrides: Partial<OperatorAttempt> = {}): OperatorAttempt {
  return {
    id: "att-100",
    cardId: "c-001",
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

describe("attemptChannel", () => {
  it("СМС-билет (channel sms из контракта попытки) — канал sms", () => {
    expect(attemptChannel(attempt({ channel: "sms", smsText: "Горит балкон" }))).toBe("sms");
  });

  it("звонок: channel call — канал call", () => {
    expect(attemptChannel(attempt({ channel: "call" }))).toBe("call");
  });

  it("поля channel в ответе нет (старый контракт) — обычный звонок", () => {
    expect(attemptChannel(attempt())).toBe("call");
  });

  it("канал читается из корня попытки, а не из снимка карточки: снимок с channel sms не меняет звонок", () => {
    expect(attemptChannel(attempt({ channel: "call", cardSnapshot: { channel: "sms" } }))).toBe("call");
  });
});

describe("attemptSmsText", () => {
  it("СМС-билет — текст из контракта попытки", () => {
    expect(attemptSmsText(attempt({ channel: "sms", smsText: "Горит балкон, помогите" }))).toBe(
      "Горит балкон, помогите",
    );
  });

  it("звонок — пустой текст, даже если в ответе попал smsText", () => {
    expect(attemptSmsText(attempt({ channel: "call", smsText: "не для звонка" }))).toBe("");
  });

  it("СМС без smsText (неполный ответ) — пустая строка, без падения", () => {
    expect(attemptSmsText(attempt({ channel: "sms" }))).toBe("");
  });
});
