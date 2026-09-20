/* T3.3-04: состояние курсанта вычисляется из ленты занятия, таймеры — локально от issuedAt/openedAt. */
import { describe, expect, it } from "vitest";

import { DEFAULT_FULL_PROCESSING_MS, DEFAULT_PRIMARY_REACTION_MS } from "@/entities/session";
import type { SessionFeedEvent } from "@/shared/api";

import { reduceLiveStates, sumErrors } from "./liveState";
import { buildStudentState, OFFLINE_SILENCE_MS } from "./studentState";

const STUDENT = "u-005";
const CARD = "c-095";
const ISSUED_AT = "2026-09-17T11:20:00+03:00";
const OPENED_AT = "2026-09-17T11:20:14+03:00";
const NORMS = {
  primaryReactionMs: DEFAULT_PRIMARY_REACTION_MS,
  fullProcessingMs: DEFAULT_FULL_PROCESSING_MS,
};

const base = { studentId: STUDENT, cardId: CARD };
const issued: SessionFeedEvent = { ...base, kind: "cardIssued", at: ISSUED_AT, level: 2 };
const opened: SessionFeedEvent = { ...base, kind: "cardOpened", at: OPENED_AT, attemptId: "att-1" };
const accepted: SessionFeedEvent = {
  ...base,
  kind: "statusChanged",
  at: "2026-09-17T11:20:30+03:00",
  attemptId: "att-1",
  mark: { ddsStatus: "accepted", at: "2026-09-17T11:20:30+03:00" },
};
const completed: SessionFeedEvent = {
  ...base,
  kind: "cardCompleted",
  at: "2026-09-17T11:23:00+03:00",
  attemptId: "att-1",
  fullProcessingMs: 166_000,
};
const evaluated: SessionFeedEvent = {
  ...base,
  kind: "aiEvaluation",
  at: "2026-09-17T11:23:00+03:00",
  attemptId: "att-1",
  isAi: true,
  totalScore: 88,
  errorCount: 2,
  aiComment: "ИИ-оценка (мок)",
};

function stateAt(events: SessionFeedEvent[], nowIso: string) {
  const live = reduceLiveStates(events, [STUDENT])[STUDENT];
  return { live, view: buildStudentState(live, Date.parse(nowIso), NORMS) };
}

describe("reduceLiveStates + buildStudentState", () => {
  it("только выдача → «ожидает», таймер реакции идёт от issuedAt", () => {
    const { view } = stateAt([issued], "2026-09-17T11:20:20+03:00");
    expect(view.state).toBe("waiting");
    expect(view.cardId).toBe(CARD);
    expect(view.reactionMs).toBe(20_000);
    expect(view.isReactionExceeded).toBe(false);
  });

  it("норматив реакции 30 с превышен строго больше — плитка краснеет без новых событий", () => {
    expect(stateAt([issued], "2026-09-17T11:20:30+03:00").view.isReactionExceeded).toBe(false);
    expect(stateAt([issued], "2026-09-17T11:20:31+03:00").view.isReactionExceeded).toBe(true);
  });

  it("открытая карточка → «отрабатывает»: реакция зафиксирована, отработка идёт", () => {
    const { view } = stateAt([issued, opened, accepted], "2026-09-17T11:22:14+03:00");
    expect(view.state).toBe("working");
    expect(view.reactionMs).toBe(14_000);
    expect(view.processingMs).toBe(120_000);
    expect(view.ddsStatus).toBe("accepted");
    expect(view.isProcessingExceeded).toBe(false);
  });

  it("норматив отработки 180 с превышен → таймер отработки красный", () => {
    const { view } = stateAt([issued, opened], "2026-09-17T11:23:20+03:00");
    expect(view.processingMs).toBeGreaterThan(DEFAULT_FULL_PROCESSING_MS);
    expect(view.isProcessingExceeded).toBe(true);
  });

  it("завершение → «завершил карточку», отработка фиксируется фактом попытки", () => {
    const { view } = stateAt([issued, opened, completed], "2026-09-17T11:30:00+03:00");
    expect(view.state).toBe("finished");
    expect(view.processingMs).toBe(166_000);
  });

  it("мок-оценка ИИ даёт счётчик ошибок плитки", () => {
    const { live } = stateAt([issued, opened, completed, evaluated], "2026-09-17T11:30:00+03:00");
    expect(sumErrors(live)).toEqual({ errorCount: 2, isAiEvaluated: true });
  });

  it("молчание АРМ дольше порога при невыполненной карточке → «не подключён»", () => {
    const silentMs = Date.parse(ISSUED_AT) + OFFLINE_SILENCE_MS + 1000;
    const { live } = stateAt([issued], ISSUED_AT);
    expect(buildStudentState(live, silentMs, NORMS).state).toBe("offline");
    /* Завершивший карточку офлайном не считается. */
    const done = reduceLiveStates([issued, opened, completed], [STUDENT])[STUDENT];
    expect(buildStudentState(done, silentMs, NORMS).state).toBe("finished");
  });

  it("курсант без событий присутствует в свёртке (плитка показывается всегда)", () => {
    const states = reduceLiveStates([], [STUDENT, "u-006"]);
    expect(Object.keys(states)).toEqual([STUDENT, "u-006"]);
    expect(buildStudentState(states["u-006"], Date.now(), NORMS)).toMatchObject({
      state: "waiting",
      cardId: null,
    });
  });
});
