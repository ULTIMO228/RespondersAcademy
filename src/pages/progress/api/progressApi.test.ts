import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { CardDetails, CardEventContract, Evaluation, SessionContract } from "@/shared/api";

import { loadStudentProgress } from "./progressApi";
import type { ProgressApi } from "./progressApi";

const EVALUATION: Evaluation = {
  timeScore: 100,
  correctnessScore: 95,
  grammarScore: 100,
  semanticScore: 96,
  totalScore: 98,
  grammarErrors: [],
  errors: [],
  aiComment: "Нормативы соблюдены",
};

function attempt(id: string, studentId: string, cardId: string, openedAt: string): CardEventContract {
  return {
    id,
    cardId,
    studentId,
    openedAt,
    primaryReactionMs: 14_000,
    statuses: [],
    servicesCalled: [],
    completedAt: openedAt,
    fullProcessingMs: 178_000,
    enteredText: {},
    calls: [],
    evaluation: EVALUATION,
  };
}

const SESSION = {
  id: "ses-1",
  studentIds: ["u-005", "u-006"],
  cardFlow: [],
  cardEvents: [
    attempt("att-02", "u-005", "c-093", "2026-09-16T10:06:52+03:00"),
    attempt("att-03", "u-006", "c-063", "2026-09-16T10:02:48+03:00"),
    attempt("att-01", "u-005", "c-063", "2026-09-16T10:02:14+03:00"),
  ],
} as unknown as SessionContract;

const FIXTURE_CARD = {
  kind: "fixture",
  card: { id: "card-36814852", number: 36814852, what: { finalType: "Ребенок в опасности" } },
} as unknown as CardDetails;

function createApi(overrides: Partial<ProgressApi> = {}): ProgressApi {
  return {
    getStudentReports: vi.fn(async () => ({ reports: [], groupReport: null })),
    listSessions: vi.fn(async () => [SESSION]),
    getAttemptEvaluation: vi.fn(async () => EVALUATION),
    getCard: vi.fn(async () => FIXTURE_CARD),
    listScenarios: vi.fn(async () => []),
    ...overrides,
  };
}

describe("loadStudentProgress", () => {
  it("запрашивает мок-API по studentId и оставляет только свои попытки (по времени)", async () => {
    const api = createApi();
    const data = await loadStudentProgress("u-005", api);
    expect(api.getStudentReports).toHaveBeenCalledWith("u-005", undefined);
    expect(api.listSessions).toHaveBeenCalledWith({ studentId: "u-005" }, undefined);
    expect(data.attempts.map((item) => item.id)).toEqual(["att-01", "att-02"]);
    expect(api.getAttemptEvaluation).not.toHaveBeenCalledWith("att-03", undefined);
  });

  it("оценка из GET /attempts/[id]/evaluation приоритетна (правка преподавателя)", async () => {
    const override = { score: 70, comment: "Учтена сложность", at: "2026-09-16T11:00:00+03:00", by: "u-002" };
    const api = createApi({
      getAttemptEvaluation: vi.fn(async () => ({ ...EVALUATION, teacherOverride: override })),
    });
    const data = await loadStudentProgress("u-005", api);
    expect(data.attempts[0].evaluation.teacherOverride).toEqual(override);
  });

  it("№ и тип — по фикстуре ПОВ-112 для сопоставленной учебной карточки", async () => {
    const api = createApi();
    const data = await loadStudentProgress("u-005", api);
    expect(api.getCard).toHaveBeenCalledWith("card-36814852", undefined);
    expect(data.captions["c-063"]).toEqual({
      number: "36814852",
      type: "Ребенок в опасности",
      href: "/arm/card/card-36814852",
    });
  });

  it("оценка не готова (evaluationPending) без оценки в занятии → попытка в pendingCount", async () => {
    const pending = new ApiError(404, "evaluationPending", "Оценка попытки ещё не готова");
    const bare = { ...SESSION, cardEvents: [{ ...SESSION.cardEvents[0], evaluation: undefined }] };
    const api = createApi({
      listSessions: vi.fn(async () => [bare]),
      getAttemptEvaluation: vi.fn(async () => Promise.reject(pending)),
    });
    const data = await loadStudentProgress("u-005", api);
    expect(data.attempts).toEqual([]);
    expect(data.pendingCount).toBe(1);
  });

  it("незавершённая попытка: оценка не запрашивается (иначе 404 в консоли), попытка в pendingCount", async () => {
    const inProgress = {
      ...SESSION.cardEvents[0],
      completedAt: "",
      fullProcessingMs: 0,
      evaluation: undefined,
    };
    const api = createApi({ listSessions: vi.fn(async () => [{ ...SESSION, cardEvents: [inProgress] }]) });
    const data = await loadStudentProgress("u-005", api);
    expect(api.getAttemptEvaluation).not.toHaveBeenCalled();
    expect(data.attempts).toEqual([]);
    expect(data.pendingCount).toBe(1);
  });

  it("403 чужих данных из мок-API пробрасывается (UI показывает ошибку, данных нет)", async () => {
    const forbidden = new ApiError(403, "forbidden", "Обучающемуся доступны только собственные результаты");
    const api = createApi({ getStudentReports: vi.fn(async () => Promise.reject(forbidden)) });
    await expect(loadStudentProgress("u-006", api)).rejects.toBe(forbidden);
  });
});
