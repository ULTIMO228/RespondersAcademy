// @vitest-environment node
/* Серверная сборка ИИ-шлюза (app/api/mock/_server/ai-gateway.ts, T1.2-10): делегаты оценки и инсайтов. */
import { beforeEach, describe, expect, it } from "vitest";

import { evaluateStoredAttempt, getServerAiGateway } from "../../../../../app/api/mock/_server/ai-gateway";
import { readGroupReport } from "../readers";
import { resetMockStore } from "../store";
import { findStoredAttempt, updateStoredAttempt } from "../store-training";

beforeEach(() => {
  resetMockStore();
});

describe("getServerAiGateway", () => {
  it("один экземпляр на процесс; ответы помечены ИИ-происхождением", async () => {
    const gateway = getServerAiGateway();
    expect(getServerAiGateway()).toBe(gateway);
    const response = await gateway.evaluateAttempt("att-01");
    expect(response).toMatchObject({ origin: "ai", provider: "mock" });
    expect(response.data).toEqual(findStoredAttempt("att-01")?.attempt.evaluation);
  });

  it("оценка читает рантайм-store: без готовой оценки — генерация по эталону, детерминированно", async () => {
    updateStoredAttempt("att-02", (draft) => {
      delete draft.evaluation;
    });
    const first = evaluateStoredAttempt("att-02");
    expect(first?.aiComment).toMatch(/^ИИ-оценка/);
    expect(evaluateStoredAttempt("att-02")).toEqual(first);
    expect(evaluateStoredAttempt("att-99")).toBeNull();
  });

  it("инсайты группы — из reports.json (groupReport), чужое занятие → []", async () => {
    const report = readGroupReport();
    const gateway = getServerAiGateway();
    expect((await gateway.groupInsights(report.sessionId)).data).toEqual(report.groupInsights);
    expect((await gateway.groupInsights("ses-nope")).data).toEqual([]);
  });
});
