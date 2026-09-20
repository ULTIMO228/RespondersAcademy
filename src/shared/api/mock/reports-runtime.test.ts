// @vitest-environment node
/*
 * Формирование отчёта занятия по рантайм-данным (reports-runtime.ts): контрактные структуры Report /
 * GroupReport из попыток занятия, идемпотентность, честное «нет данных по попыткам» и неприкосновенность
 * статических отчётов mocks/reports.json.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CardEvent, Evaluation, Session } from "../types";

import { ensureSessionReport, NO_ATTEMPTS_COMMENT, NO_ATTEMPTS_INSIGHT } from "./reports-runtime";
import type { RuntimeReportDeps } from "./reports-runtime";
import { resetMockStore } from "./store";
import { findStoredGroupReport, listStoredReports } from "./store-reports";
import { findStoredAttempt, insertStoredSession, updateStoredSession } from "./store-training";

const NOW = "2026-09-19T12:10:00+03:00";
const SESSION_ID = "ses-900";
const STATIC_SESSION_ID = "ses-2026-09-16-01";
const NORMS = { primaryReactionMs: 30_000, fullProcessingMs: 180_000 };

function evaluation(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    timeScore: 90,
    correctnessScore: 80,
    grammarScore: 90,
    semanticScore: 70,
    totalScore: 82,
    grammarErrors: [],
    errors: [],
    aiComment: "ИИ-оценка (мок): тест",
    ...overrides,
  };
}

function attempt(id: string, studentId: string, overrides: Partial<CardEvent> = {}): CardEvent {
  return {
    id,
    cardId: "c-091",
    studentId,
    openedAt: "2026-09-19T12:00:20+03:00",
    primaryReactionMs: 20_000,
    statuses: [],
    servicesCalled: [],
    completedAt: "2026-09-19T12:02:20+03:00",
    fullProcessingMs: 120_000,
    enteredText: { dispatcherAction: "Сообщение принято" },
    calls: [],
    ...overrides,
  };
}

function session(cardEvents: CardEvent[], studentIds = ["u-005", "u-006"]): Session {
  return {
    id: SESSION_ID,
    teacherId: "u-002",
    studentIds,
    scenarioIds: ["s-031"],
    mode: "practice",
    cardSource: "generated",
    cardFlow: [],
    state: "reported",
    startedAt: "2026-09-19T12:00:00+03:00",
    finishedAt: "2026-09-19T12:09:50+03:00",
    cardEvents,
  };
}

/** Оценщик-заглушка вместо ИИ-шлюза: у shared нет доступа к entities/report. */
function createDeps(evaluations: Record<string, Evaluation> = {}, insights: string[] = []) {
  const evaluateAttempt = vi.fn(async (attemptId: string) => evaluations[attemptId] ?? null);
  const deps: RuntimeReportDeps = {
    evaluateAttempt,
    resolveAttemptNorms: () => NORMS,
    groupInsights: async () => insights,
  };
  return { deps, evaluateAttempt };
}

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

describe("ensureSessionReport", () => {
  it("собирает отчёт курсанта из попыток: тайминги против нормативов, ошибки, графики", async () => {
    insertStoredSession(
      session([
        attempt("att-r1", "u-005", { evaluation: evaluation({ totalScore: 90 }) }),
        attempt("att-r2", "u-005", {
          cardId: "c-092",
          primaryReactionMs: 48_000,
          fullProcessingMs: 310_000,
          evaluation: evaluation({
            totalScore: 60,
            grammarErrors: [
              {
                field: "dispatcherAction",
                fragment: "Сообщение пренято",
                wrong: "пренято",
                expected: "принято",
                type: "spelling",
              },
            ],
            errors: [
              { type: "timeReactionExceeded", severity: "major", message: "Превышен норматив реакции" },
              { type: "missedRequiredCall", severity: "critical", message: "Пропущен звонок" },
            ],
          }),
        }),
      ]),
    );
    const { deps } = createDeps();
    await ensureSessionReport(SESSION_ID, deps);

    const report = listStoredReports().find((item) => item.student.studentId === "u-005");
    expect(report).toBeDefined();
    expect(report?.id).toBe("rep-900-u-005");
    expect(report?.generatedAt).toBe(NOW);
    expect(report?.exportFormats).toEqual(["csv", "pdf"]);
    expect(report?.student).toMatchObject({ studentId: "u-005", armNumber: 1 });
    // Два этапа на попытку: 30 000 / 180 000 мс (ТЗ §7) и отклонение со знаком.
    expect(report?.timeMetrics).toHaveLength(4);
    expect(report?.timeMetrics[0]).toEqual({
      cardId: "c-091",
      stage: "Первичная реакция",
      normMs: 30_000,
      factMs: 20_000,
      deviationMs: -10_000,
    });
    expect(report?.timeMetrics[3].deviationMs).toBe(130_000);
    expect(report?.grammarErrors).toEqual([expect.objectContaining({ cardId: "c-092", wrong: "пренято" })]);
    expect(report?.errors.map((error) => error.cardId)).toEqual(["c-092", "c-092"]);
    // Балл — среднее по попыткам, как в reports-score.ts.
    expect(report?.score).toBe(75);
    expect(report?.charts.byStage).toEqual({
      stages: ["Первичная реакция", "Полная отработка"],
      normMs: [30_000, 180_000],
      attempts: [
        { attemptId: "att-r1", cardId: "c-091", factMs: [20_000, 120_000] },
        { attemptId: "att-r2", cardId: "c-092", factMs: [48_000, 310_000] },
      ],
    });
    expect(report?.charts.byErrorType).toEqual({
      grammar: { spelling: 1, syntax: 0 },
      errors: { critical: 1, major: 1, minor: 0 },
    });
    expect(report?.charts.dynamics).toEqual({ labels: ["att-r1", "att-r2"], scores: [90, 60] });
    expect(report?.aiComment).toContain("отработано карточек — 2");
  });

  it("групповой свод: reportIds, инсайты ИИ и три графика", async () => {
    insertStoredSession(
      session([
        attempt("att-r1", "u-005", { evaluation: evaluation({ totalScore: 90 }) }),
        attempt("att-r2", "u-006", { primaryReactionMs: 48_000, evaluation: evaluation({ totalScore: 60 }) }),
      ]),
    );
    await ensureSessionReport(SESSION_ID, createDeps().deps);

    const group = findStoredGroupReport(SESSION_ID);
    expect(group?.id).toBe("rep-900-group");
    expect(group?.generatedAt).toBe(NOW);
    expect(group?.reportIds).toEqual(["rep-900-u-005", "rep-900-u-006"]);
    expect(group?.groupInsights.length).toBeGreaterThan(0);
    expect(group?.groupInsights[1]).toContain("превысили норматив первичной реакции (30 с)");
    expect(group?.charts.scoreByStudent.series).toEqual({
      labels: ["Иванов", "Петрова"],
      values: [90, 60],
    });
    expect(group?.charts.reactionByAttempt.series).toEqual({
      labels: ["att-r1", "att-r2"],
      values: [20, 48],
      norm: 30,
    });
    expect(group?.charts.errorsByCriterion.series.criteria).toEqual([
      "Время",
      "Корректность",
      "Грамматика",
      "Смысл",
    ]);
  });

  it("инсайты берутся у ИИ-шлюза, если он их отдаёт", async () => {
    insertStoredSession(session([attempt("att-r1", "u-005", { evaluation: evaluation() })]));
    await ensureSessionReport(SESSION_ID, createDeps({}, ["Инсайт шлюза"]).deps);
    expect(findStoredGroupReport(SESSION_ID)?.groupInsights).toEqual(["Инсайт шлюза"]);
  });

  it("оценка попытки запрашивается у шлюза один раз и фиксируется в занятии", async () => {
    insertStoredSession(session([attempt("att-r1", "u-005")]));
    const { deps, evaluateAttempt } = createDeps({ "att-r1": evaluation({ totalScore: 77 }) });
    await ensureSessionReport(SESSION_ID, deps);
    expect(evaluateAttempt).toHaveBeenCalledTimes(1);
    expect(findStoredAttempt("att-r1")?.attempt.evaluation?.totalScore).toBe(77);
  });

  it("повторный вызов не дублирует и не пересоздаёт отчёт (идемпотентность)", async () => {
    insertStoredSession(session([attempt("att-r1", "u-005", { evaluation: evaluation() })]));
    await ensureSessionReport(SESSION_ID, createDeps().deps);
    const first = listStoredReports();
    vi.setSystemTime(new Date("2026-09-19T12:20:00+03:00"));
    await ensureSessionReport(SESSION_ID, createDeps().deps);
    expect(listStoredReports()).toEqual(first);
    expect(findStoredGroupReport(SESSION_ID)?.generatedAt).toBe(NOW);
  });

  it("занятие без завершённых попыток → честное «нет данных по попыткам»", async () => {
    insertStoredSession(
      session([attempt("att-r1", "u-005", { completedAt: "", fullProcessingMs: 0 })], ["u-005"]),
    );
    await ensureSessionReport(SESSION_ID, createDeps({ "att-r1": evaluation() }).deps);

    const [report] = listStoredReports();
    expect(report.aiComment).toBe(NO_ATTEMPTS_COMMENT);
    expect(report.timeMetrics).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.score).toBe(0);
    expect(report.charts.byStage).toEqual({
      stages: ["Первичная реакция", "Полная отработка"],
      normMs: [30_000, 180_000],
      attempts: [],
    });
    expect(report.charts.dynamics).toEqual({ labels: [], scores: [] });
    expect(findStoredGroupReport(SESSION_ID)?.groupInsights).toEqual([NO_ATTEMPTS_INSIGHT]);
  });

  it("незавершённое занятие отчёт не формирует", async () => {
    insertStoredSession({ ...session([attempt("att-r1", "u-005")]), state: "running", finishedAt: null });
    await ensureSessionReport(SESSION_ID, createDeps({ "att-r1": evaluation() }).deps);
    expect(listStoredReports()).toEqual([]);
    expect(findStoredGroupReport(SESSION_ID)).toBeUndefined();
  });

  it("занятие со статикой в reports.json рантайм-отчёт не формирует", async () => {
    updateStoredSession(STATIC_SESSION_ID, (draft) => {
      draft.state = "reported";
    });
    await ensureSessionReport(STATIC_SESSION_ID, createDeps().deps);
    expect(listStoredReports()).toEqual([]);
    expect(findStoredGroupReport(STATIC_SESSION_ID)).toBeUndefined();
  });
});
