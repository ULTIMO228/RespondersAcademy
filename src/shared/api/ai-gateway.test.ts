import reportsJson from "@mocks/reports.json";
import { describe, expect, it } from "vitest";

import type { AiGateway, AiResponse } from "./ai-gateway";
import { createMockAiGateway, MockAiGateway } from "./ai-gateway.mock";
import type { Evaluation, GrammarError, GroupReport, Scenario } from "./types";

const groupReport = reportsJson.groupReport as GroupReport;

const evaluation: Evaluation = {
  timeScore: 90,
  correctnessScore: 80,
  grammarScore: 100,
  semanticScore: 70,
  totalScore: 85,
  grammarErrors: [],
  errors: [],
  aiComment: "ИИ-оценка (мок): тест",
};

const gateway = createMockAiGateway({
  evaluateAttempt: (id) => (id === "att-01" ? evaluation : null),
  groupReports: [groupReport],
});

describe("MockAiGateway", () => {
  it("generateScenario → 2–3 мок-сценария: pending, generated, контракт Scenario", async () => {
    const response: AiResponse<Scenario[]> = await gateway.generateScenario("пожар на улице");
    expect(response).toMatchObject({ origin: "ai", provider: "mock" });
    expect(response.data.length).toBeGreaterThanOrEqual(2);
    expect(response.data.length).toBeLessThanOrEqual(3);
    for (const scenario of response.data) {
      expect(scenario.validation.status).toBe("pending");
      expect(scenario.source).toBe("generated");
      expect(scenario.timeNorms).toEqual({ primaryReactionSec: 30, fullProcessingSec: 180 });
      expect(scenario.etalon.keyPhrases).toContain("пожар на улице");
    }
    expect(new Set(response.data.map((scenario) => scenario.id)).size).toBe(response.data.length);
    expect(await gateway.generateScenario("пожар на улице")).toEqual(response);
    expect((await gateway.generateScenario("  ")).data).toEqual([]);
  });

  it("checkGrammar детерминирован, ошибки типа spelling | syntax", async () => {
    const first: AiResponse<GrammarError[]> = await gateway.checkGrammar(
      "механик напрален  на место",
      "dispatcherAction",
    );
    expect(await gateway.checkGrammar("механик напрален  на место", "dispatcherAction")).toEqual(first);
    expect(first.data.map((error) => error.type).sort()).toEqual(["spelling", "syntax", "syntax"]);
    expect(first.data.every((error) => error.field === "dispatcherAction")).toBe(true);
  });

  it("evaluateAttempt делегирует мок-оценке T1.2-08", async () => {
    expect((await gateway.evaluateAttempt("att-01")).data).toEqual(evaluation);
    expect((await gateway.evaluateAttempt("att-404")).data).toBeNull();
  });

  it("groupInsights — из reports.json по sessionId", async () => {
    expect((await gateway.groupInsights(groupReport.sessionId)).data).toEqual(groupReport.groupInsights);
    expect((await gateway.groupInsights("ses-unknown")).data).toEqual([]);
  });

  it("реализация подменяется через инъекцию без правки вызывающего кода", async () => {
    const summarize = async (ai: AiGateway) => (await ai.groupInsights("ses-1")).data.length;
    const stub: AiGateway = {
      evaluateAttempt: async () => ({ origin: "ai", provider: "service", data: null }),
      generateScenario: async () => ({ origin: "ai", provider: "service", data: [] }),
      checkGrammar: async () => ({ origin: "ai", provider: "service", data: [] }),
      groupInsights: async () => ({ origin: "ai", provider: "service", data: ["a", "b"] }),
    };
    expect(await summarize(stub)).toBe(2);
    expect(await summarize(new MockAiGateway({ evaluateAttempt: () => null, groupReports: [] }))).toBe(0);
  });
});
