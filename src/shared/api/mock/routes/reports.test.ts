// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { GET as evaluationRoute } from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import { GET as reportsRoute } from "../../../../../app/api/mock/reports/route";
import type { ApiErrorBody, Evaluation, ReportsResponse } from "../../types";
import { resetMockStore } from "../store";
import { updateStoredAttempt } from "../store-training";

const FINISHED_ID = "ses-2026-09-16-01";

function reports(query: string): Promise<Response> {
  return reportsRoute(new Request(`http://localhost/api/mock/reports${query}`));
}

function evaluation(id: string): Promise<Response> {
  return evaluationRoute(new Request(`http://localhost/api/mock/attempts/${id}/evaluation`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /api/mock/reports?sessionId=", () => {
  it("завершённое занятие → 3 персональных отчёта + groupReport с reportIds", async () => {
    const body: ReportsResponse = await (await reports(`?sessionId=${FINISHED_ID}`)).json();
    expect(body.reports).toHaveLength(3);
    expect(body.reports.every((report) => report.sessionId === FINISHED_ID)).toBe(true);
    for (const report of body.reports) {
      expect(Object.keys(report.charts)).toEqual(
        expect.arrayContaining(["byStage", "byErrorType", "dynamics"]),
      );
    }
    expect(body.groupReport?.reportIds).toEqual(body.reports.map((report) => report.id));
  });

  it("идущее занятие → пустые отчёты; без sessionId → 400; неизвестное → 404", async () => {
    expect(await (await reports("?sessionId=ses-2026-09-17-demo")).json()).toEqual({
      reports: [],
      groupReport: null,
    });
    expect((await reports("")).status).toBe(400);
    expect((await reports("?sessionId=ses-nope")).status).toBe(404);
  });
});

describe("GET /api/mock/attempts/[id]/evaluation", () => {
  it("готовая оценка из sessions.json → 200", async () => {
    const response = await evaluation("att-01");
    expect(response.status).toBe(200);
    const body: Evaluation = await response.json();
    expect(typeof body.totalScore).toBe("number");
    expect(typeof body.aiComment).toBe("string");
  });

  it("teacherOverride отдаётся как есть и не затирается", async () => {
    const override = { score: 95, comment: "Засчитано", at: "2026-09-16T11:00:00+03:00", by: "u-002" };
    updateStoredAttempt("att-02", (draft) => {
      if (draft.evaluation) draft.evaluation.teacherOverride = override;
    });
    const body: Evaluation = await (await evaluation("att-02")).json();
    expect(body.teacherOverride).toEqual(override);
  });

  it("нет готовой оценки → детерминированная мок-оценка по эталону сценария (T1.2-08)", async () => {
    updateStoredAttempt("att-03", (draft) => {
      delete draft.evaluation;
    });
    const first: Evaluation = await (await evaluation("att-03")).json();
    const second: Evaluation = await (await evaluation("att-03")).json();
    expect(first).toEqual(second);
    for (const score of [first.timeScore, first.correctnessScore, first.grammarScore, first.semanticScore]) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
    expect(first.aiComment).toMatch(/^ИИ-оценка/);
  });

  it("нет оценки и эталона → 404 evaluationPending; неизвестная попытка → 404 notFound", async () => {
    updateStoredAttempt("att-03", (draft) => {
      delete draft.evaluation;
      draft.cardId = "c-000";
    });
    const pending = await evaluation("att-03");
    expect(pending.status).toBe(404);
    expect(((await pending.json()) as ApiErrorBody).error.code).toBe("evaluationPending");
    const unknown = await evaluation("att-99");
    expect(((await unknown.json()) as ApiErrorBody).error.code).toBe("notFound");
  });
});
