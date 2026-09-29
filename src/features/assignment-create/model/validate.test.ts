import { describe, expect, it } from "vitest";

import { createDraft } from "./types";
import type { WizardDraft } from "./types";
import { buildRequest, validateAll, validateParams, validateStep, validateTickets } from "./validate";

const draft = (overrides: Partial<WizardDraft> = {}): WizardDraft => ({
  ...createDraft(),
  studentIds: ["u-005"],
  cardIds: ["c-010"],
  ...overrides,
});

describe("валидация мастера назначения", () => {
  it("без обучающихся шаг 1 невалиден", () => {
    expect(validateStep(0, draft({ studentIds: [] })).studentIds).toBeTruthy();
    expect(validateStep(0, draft())).toEqual({});
  });

  it("билеты: нужен источник; перечень пуст — ошибка; случайный набор — количество 1–100", () => {
    expect(validateTickets(draft({ cardIds: [] })).cardIds).toBeTruthy();
    expect(validateTickets(draft({ ticketSource: "rule", ruleCount: "0" })).ruleCount).toBeTruthy();
    expect(validateTickets(draft({ ticketSource: "rule", ruleCount: "101" })).ruleCount).toBeTruthy();
    expect(validateTickets(draft({ ticketSource: "rule", ruleCount: "100" }))).toEqual({});
  });

  it("цепочка: каждому билету нужна версия operator112", () => {
    const chain = draft({ trainingMode: "chain", cardIds: ["c-010", "c-020"] });
    expect(validateTickets(chain).cardIds).toBeTruthy();
    const withVersions = {
      ...chain,
      scenarioVersions: [
        { scenarioId: "sc-1", version: 2, cardId: "c-010" },
        { scenarioId: "sc-2", version: 2, cardId: "c-020" },
      ],
    };
    expect(validateTickets(withVersions)).toEqual({});
  });

  it("параметры: нормативы > 0, порог 0–100, лимит > 0 или пуст", () => {
    expect(validateParams(draft({ answerSec: "0" })).answerSec).toBeTruthy();
    expect(validateParams(draft({ submitSec: "abc" })).submitSec).toBeTruthy();
    expect(validateParams(draft({ format: "exam", passThreshold: "101" })).passThreshold).toBeTruthy();
    expect(validateParams(draft({ format: "exam", passThreshold: "0" }))).toEqual({});
    expect(validateParams(draft({ timeLimitSec: "0" })).timeLimitSec).toBeTruthy();
    expect(validateParams(draft({ timeLimitSec: "" }))).toEqual({});
  });

  it("сообщения служб: четыре строго возрастающих интервала", () => {
    const on = { workMessagesEnabled: true };
    expect(validateParams(draft(on))).toEqual({});
    expect(
      validateParams(draft({ ...on, workMessageIntervals: ["20", "20", "90", "150"] })).workMessageIntervals,
    ).toBeTruthy();
    expect(
      validateParams(draft({ ...on, workMessageIntervals: ["20", "50", "90", ""] })).workMessageIntervals,
    ).toBeTruthy();
  });

  it("validateAll объединяет ошибки всех шагов", () => {
    expect(Object.keys(validateAll(draft({ studentIds: [], cardIds: [], answerSec: "0" })))).toEqual(
      expect.arrayContaining(["studentIds", "cardIds", "answerSec"]),
    );
  });
});

describe("buildRequest", () => {
  it("перечень билетов: cardIds без randomRule", () => {
    const request = buildRequest(draft({ title: " Тренировка " }));
    expect(request).toMatchObject({
      studentIds: ["u-005"],
      cardIds: ["c-010"],
      title: "Тренировка",
      format: "training",
    });
    expect(request.randomRule).toBeUndefined();
    expect(request.scenarioVersions).toBeUndefined();
  });

  it("случайный набор: randomRule без cardIds", () => {
    const request = buildRequest(
      draft({ ticketSource: "rule", ruleGroups: ["Пожар"], ruleDifficulty: [2, 3], ruleCount: "7" }),
    );
    expect(request.randomRule).toEqual({ groups: ["Пожар"], difficulty: [2, 3], count: 7 });
    expect(request.cardIds).toBeUndefined();
  });

  it("экзамен: подсказки выключены, порог и лимит переданы", () => {
    const params = buildRequest(
      draft({ format: "exam", hintsEnabled: true, passThreshold: "80", timeLimitSec: "600" }),
    ).params;
    expect(params).toMatchObject({ hints: { enabled: false }, passThreshold: 80, timeLimitSec: 600 });
    expect(params?.hints).not.toHaveProperty("idleSec");
  });

  it("тренировка: порога нет; подсказки с паузой; интервалы только при включённых сообщениях", () => {
    const base = buildRequest(draft()).params;
    expect(base).toMatchObject({ hints: { enabled: true, idleSec: 20 }, workMessagesEnabled: false });
    expect(base).not.toHaveProperty("passThreshold");
    expect(base).not.toHaveProperty("workMessageIntervalsSec");
    expect(buildRequest(draft({ workMessagesEnabled: true })).params?.workMessageIntervalsSec).toEqual([
      20, 50, 90, 150,
    ]);
  });

  it("цепочка: cardIds и scenarioVersions; срок — конец дня по Москве", () => {
    const versions = [{ scenarioId: "sc-1", version: 2, cardId: "c-010" }];
    const request = buildRequest(
      draft({ trainingMode: "chain", scenarioVersions: versions, dueDate: "2026-10-05" }),
    );
    expect(request.scenarioVersions).toEqual(versions);
    expect(request.dueAt).toBe("2026-10-05T23:59:59+03:00");
  });
});
