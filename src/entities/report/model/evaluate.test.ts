import scenariosJson from "@mocks/scenarios.json";
import sessionsJson from "@mocks/sessions.json";
import { describe, expect, it } from "vitest";

import type { CardEventContract, Etalon, Scenario, SessionContract, SuccessCriteria } from "@/shared/api";

import { AI_COMMENT_PREFIX, computeTotalScore, generateEvaluation, getAttemptEvaluation } from "./evaluate";

const sessions = sessionsJson.sessions as SessionContract[];
const scenarios = scenariosJson.scenarios as Scenario[];
const finished = sessions[0];
const storedAttempt = finished.cardEvents[0];
const scenario = scenarios.find((item) => item.id === "s-021") as Scenario;

const etalon: Etalon = {
  expectedActions: ["openCard:c-063", "status:accepted", "call:102", "call:101", "status:workDone"],
  keyPhrases: ["сообщение принято", "наряд полиции направлен"],
};
const criteria: SuccessCriteria = {
  maxGrammarErrors: 1,
  requiredFields: ["dispatcherAction"],
  syntaxRequirements: "",
};

function stripEvaluation(attempt: CardEventContract): CardEventContract {
  const copy = { ...attempt };
  delete copy.evaluation;
  return copy;
}

function makeAttempt(patch: Partial<CardEventContract> = {}): CardEventContract {
  return {
    ...stripEvaluation(storedAttempt),
    id: "att-new",
    primaryReactionMs: 20_000,
    fullProcessingMs: 150_000,
    statuses: [
      { ddsStatus: "accepted", at: "2026-09-16T10:02:31+03:00" },
      { ddsStatus: "workDone", at: "2026-09-16T10:05:12+03:00" },
    ],
    calls: [
      { toNumber: "102", startedAt: "2026-09-16T10:03:00+03:00", transcript: [] },
      { toNumber: "101", startedAt: "2026-09-16T10:04:00+03:00", transcript: [] },
    ],
    enteredText: { dispatcherAction: "Сообщение принято, наряд полиции направлен", outfitNumber: "5" },
    ...patch,
  };
}

function withoutEvaluations(): SessionContract[] {
  return sessions.map((session) => ({
    ...session,
    cardEvents: session.cardEvents.map(stripEvaluation),
  }));
}

describe("getAttemptEvaluation", () => {
  it("готовая оценка из sessions.json возвращается без изменений", () => {
    const result = getAttemptEvaluation(storedAttempt.id, { sessions, scenarios });
    expect(result).toEqual({ status: "ready", source: "stored", evaluation: storedAttempt.evaluation });
    if (result.status === "ready") expect(result.evaluation).toBe(storedAttempt.evaluation);
  });

  it("новая попытка → генерация по эталону сценария занятия, все оси 0..100", () => {
    const result = getAttemptEvaluation("att-03", { sessions: withoutEvaluations(), scenarios });
    expect(result.status === "ready" && result.source).toBe("generated");
    if (result.status !== "ready") return;
    for (const key of [
      "timeScore",
      "correctnessScore",
      "grammarScore",
      "semanticScore",
      "totalScore",
    ] as const) {
      expect(result.evaluation[key]).toBeGreaterThanOrEqual(0);
      expect(result.evaluation[key]).toBeLessThanOrEqual(100);
    }
    expect(result.evaluation.grammarErrors.map((error) => error.wrong)).toEqual(["пренято", "напрален"]);
    expect(result.evaluation.errors.map((error) => error.type)).toContain("timeReactionExceeded");
  });

  it("повторный вызов с тем же вводом → тот же объект оценки", () => {
    const sources = { sessions: withoutEvaluations(), scenarios };
    expect(getAttemptEvaluation("att-02", sources)).toEqual(getAttemptEvaluation("att-02", sources));
  });

  it("неизвестная попытка / нет эталона", () => {
    expect(getAttemptEvaluation("att-404", { sessions, scenarios })).toEqual({ status: "attemptNotFound" });
    expect(getAttemptEvaluation("att-03", { sessions: withoutEvaluations(), scenarios: [] })).toEqual({
      status: "etalonNotFound",
    });
  });
});

describe("generateEvaluation", () => {
  const base = generateEvaluation(makeAttempt(), etalon, criteria);

  it("эталонная попытка — высокий балл по всем осям, пометка ИИ-происхождения", () => {
    expect(base).toMatchObject({
      timeScore: 100,
      correctnessScore: 100,
      grammarScore: 100,
      semanticScore: 100,
    });
    expect(base.totalScore).toBe(100);
    expect(base.errors).toEqual([]);
    expect(base.aiComment.startsWith(AI_COMMENT_PREFIX)).toBe(true);
  });

  it("превышение обоих нормативов снижает timeScore", () => {
    const late = generateEvaluation(
      makeAttempt({ primaryReactionMs: 48_000, fullProcessingMs: 310_000 }),
      etalon,
      criteria,
    );
    expect(late.timeScore).toBeLessThan(base.timeScore);
    expect(late.errors.map((error) => error.type)).toEqual([
      "timeReactionExceeded",
      "timeProcessingExceeded",
    ]);
    const custom = generateEvaluation(makeAttempt({ primaryReactionMs: 25_000 }), etalon, criteria, {
      timeNorms: { primaryReactionMs: 20_000, fullProcessingMs: 180_000 },
    });
    expect(custom.timeScore).toBeLessThan(100);
  });

  it("enteredText без keyPhrases → низкий semanticScore; словоформы засчитываются", () => {
    const off = generateEvaluation(
      makeAttempt({ enteredText: { dispatcherAction: "Выехали на место" } }),
      etalon,
      criteria,
    );
    expect(off.semanticScore).toBeLessThan(30);
    const forms = generateEvaluation(
      makeAttempt({ enteredText: { dispatcherAction: "Сообщения приняты, направлены наряды полиции" } }),
      etalon,
      criteria,
    );
    expect(forms.semanticScore).toBe(100);
  });

  it("превышение maxGrammarErrors → снижение grammarScore сильнее, чем в пределах лимита", () => {
    const one = generateEvaluation(
      makeAttempt({ enteredText: { dispatcherAction: "Сообщение пренято" } }),
      etalon,
      criteria,
    );
    const two = generateEvaluation(
      makeAttempt({ enteredText: { dispatcherAction: "Сообщение пренято, наряд напрален" } }),
      etalon,
      criteria,
    );
    expect(one.grammarScore).toBe(90);
    expect(two.grammarScore).toBe(40);
    expect(two.errors.map((error) => error.type)).toContain("grammarLimitExceeded");
  });

  it("пропущенный звонок и неверный порядок снижают correctnessScore", () => {
    const missed = generateEvaluation(makeAttempt({ calls: [] }), etalon, criteria);
    expect(missed.correctnessScore).toBe(50);
    expect(missed.errors.filter((error) => error.type === "missedRequiredCall")).toHaveLength(2);
  });

  it("teacherOverride не перезаписывается генерацией", () => {
    const teacherOverride = { score: 85, comment: "Засчитано", at: "2026-09-16T11:00:00+03:00", by: "u-002" };
    const stored = { ...base, totalScore: 10, teacherOverride };
    const regenerated = generateEvaluation(makeAttempt({ evaluation: stored }), etalon, criteria);
    expect(regenerated.teacherOverride).toEqual(teacherOverride);
  });

  it("генерация на реальном сценарии детерминирована и не мутирует вход", () => {
    const attempt = makeAttempt();
    const snapshot = JSON.stringify(attempt);
    const first = generateEvaluation(attempt, scenario.etalon, scenario.successCriteria);
    expect(generateEvaluation(attempt, scenario.etalon, scenario.successCriteria)).toEqual(first);
    expect(JSON.stringify(attempt)).toBe(snapshot);
  });
});

describe("computeTotalScore", () => {
  const scores = { timeScore: 100, correctnessScore: 50, grammarScore: 100, semanticScore: 50 };

  it("по умолчанию — равные веса", () => {
    expect(computeTotalScore(scores)).toBe(75);
  });

  it("веса преподавателя меняют итог", () => {
    expect(
      computeTotalScore(scores, { timeScore: 3, correctnessScore: 1, grammarScore: 0, semanticScore: 0 }),
    ).toBe(88);
  });
});
