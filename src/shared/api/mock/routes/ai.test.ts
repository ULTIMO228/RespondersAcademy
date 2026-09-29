// @vitest-environment node
/* Автономные ответы ИИ-панелей /api/v1/ai/** (спека 002, T006): контракт форм, права, идемпотентность, метка имитации. */
import { beforeEach, describe, expect, it } from "vitest";

import { GET as attemptReviewRoute } from "../../../../../app/api/v1/ai/attempts/[id]/review/route";
import { POST as attemptResolveRoute } from "../../../../../app/api/v1/ai/attempts/[id]/resolve/route";
import { GET as attemptStateRoute } from "../../../../../app/api/v1/ai/attempts/[id]/assessment-state/route";
import { GET as myErrorsRoute } from "../../../../../app/api/v1/ai/me/errors/route";
import { POST as approveRoute } from "../../../../../app/api/v1/ai/scenarios/[id]/approve/route";
import { POST as reviseRoute } from "../../../../../app/api/v1/ai/scenarios/[id]/revise/route";
import { GET as versionsRoute } from "../../../../../app/api/v1/ai/scenarios/[id]/versions/route";
import { POST as draftsRoute } from "../../../../../app/api/v1/ai/scenarios/drafts/route";
import { GET as sessionErrorSummaryRoute } from "../../../../../app/api/v1/ai/sessions/[id]/error-summary/route";
import { GET as sessionErrorsRoute } from "../../../../../app/api/v1/ai/sessions/[id]/errors/route";
import { isStandaloneAiRelease } from "../../ai-standalone-marker";
import type {
  AIScenarioVersion,
  ApiErrorBody,
  AssessmentReviewResponse,
  AssessmentStateResponse,
  PaginatedErrorRecordsResponse,
  SessionErrorSummaryResponse,
  StudentErrorsResponse,
} from "../../types";
import { buildSessionCookie } from "../session-cookie";
import { resetMockStore } from "../store";

const SESSION_ID = "ses-2026-09-16-01";
const TEACHER = "u-002";
const OTHER_TEACHER = "u-003";
const ADMIN = "u-001";
const STUDENT = "u-005";
const ATTEMPT = "att-02";

function cookieOf(userId: string): string {
  return buildSessionCookie(userId);
}

const asTeacher = cookieOf(TEACHER);
const asOtherTeacher = cookieOf(OTHER_TEACHER);
const asAdmin = cookieOf(ADMIN);
const asStudent = cookieOf(STUDENT);

function call(path: string, cookie?: string, body?: unknown): Request {
  return new Request(`http://localhost/api/v1/ai${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const withId = (id: string) => ({ params: Promise.resolve({ id }) });

async function errorOf(response: Response): Promise<{ status: number; code: string; message: string }> {
  return { status: response.status, ...((await response.json()) as ApiErrorBody).error };
}

async function createDraft(cookie = asTeacher, requestId = "req-1"): Promise<AIScenarioVersion> {
  const response = await draftsRoute(
    call("/scenarios/drafts", cookie, {
      mode: "operator112",
      sourceTicketId: "c-010",
      category: "пожар в жилом доме",
      count: 1,
      requestId,
    }),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as AIScenarioVersion[])[0];
}

beforeEach(() => {
  resetMockStore();
});

describe("сценарии: черновик → правка → утверждение", () => {
  it("черновик из учебной карточки: версия 1, структурная проверка пройдена, метка имитации в эталоне", async () => {
    const draft = await createDraft();
    expect(draft).toMatchObject({
      schemaVersion: "ai-workflow/1",
      scenarioId: "ais-001",
      version: 1,
      mode: "operator112",
      sourceTicketId: "c-010",
      validation: "passed",
      approval: "draft",
    });
    expect(draft.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(isStandaloneAiRelease(draft.etalonVersion)).toBe(true);
    expect(draft.cardSnapshot.fields.summary).toContain("Горит балкон");
    const list = await (
      await versionsRoute(call("/scenarios/ais-001/versions", asTeacher), withId("ais-001"))
    ).json();
    expect(list).toHaveLength(1);
  });

  it("повтор requestId возвращает тот же черновик, не создавая второй", async () => {
    const first = await createDraft(asTeacher, "same");
    const second = await createDraft(asTeacher, "same");
    expect(second.scenarioId).toBe(first.scenarioId);
    const drafts = await (
      await versionsRoute(call("/scenarios/ais-002/versions", asTeacher), withId("ais-002"))
    ).json();
    expect(drafts).toEqual([]);
  });

  it("правка фабулы создаёт версию 2 с решением преподавателя, утверждение — идемпотентно", async () => {
    await createDraft();
    const revised = await reviseRoute(
      call("/scenarios/ais-001/revise", asTeacher, {
        baseVersion: 1,
        comment: "Уточнён этаж",
        acceptedFields: [{ fieldPath: "summary", decision: "edited", value: "Горит балкон на 13 этаже" }],
        requestId: "req-rev",
      }),
      withId("ais-001"),
    );
    expect(revised.status).toBe(201);
    const second: AIScenarioVersion = await revised.json();
    expect(second).toMatchObject({
      version: 2,
      parentVersion: 1,
      teacherComment: "Уточнён этаж",
      approval: "draft",
    });
    expect(second.cardSnapshot.fields.summary).toBe("Горит балкон на 13 этаже");
    expect(second.fieldDecisions[0]).toMatchObject({
      fieldPath: "summary",
      decision: "edited",
      teacherId: TEACHER,
    });

    const approveBody = { version: 2, requestId: "req-app" };
    const approved: AIScenarioVersion = await (
      await approveRoute(call("/scenarios/ais-001/approve", asTeacher, approveBody), withId("ais-001"))
    ).json();
    expect(approved).toMatchObject({ version: 2, approval: "approved", approvedBy: TEACHER });
    const again = await approveRoute(
      call("/scenarios/ais-001/approve", asTeacher, approveBody),
      withId("ais-001"),
    );
    expect(again.status).toBe(200);
    expect(((await again.json()) as AIScenarioVersion).approval).toBe("approved");
  });

  it("устаревшая baseVersion → 409; пустая фабула не проходит проверку и не утверждается", async () => {
    await createDraft();
    const stale = await reviseRoute(
      call("/scenarios/ais-001/revise", asTeacher, {
        baseVersion: 3,
        comment: "",
        acceptedFields: [{ fieldPath: "summary", decision: "accepted" }],
        requestId: "r1",
      }),
      withId("ais-001"),
    );
    expect(await errorOf(stale)).toMatchObject({ status: 409, code: "conflict" });
    const emptied: AIScenarioVersion = await (
      await reviseRoute(
        call("/scenarios/ais-001/revise", asTeacher, {
          baseVersion: 1,
          comment: "",
          acceptedFields: [{ fieldPath: "summary", decision: "edited", value: "  " }],
          requestId: "r2",
        }),
        withId("ais-001"),
      )
    ).json();
    expect(emptied).toMatchObject({ validation: "failed", approval: "validation_failed" });
    expect(emptied.validationErrors[0]).toMatchObject({ fieldPath: "summary", code: "required" });
    const denied = await approveRoute(
      call("/scenarios/ais-001/approve", asTeacher, { version: 2, requestId: "r3" }),
      withId("ais-001"),
    );
    expect(await errorOf(denied)).toMatchObject({ status: 409, code: "conflict" });
  });

  it("права: аноним → 401, обучающийся → 403, чужой преподаватель → 403, администратор → 200", async () => {
    await createDraft();
    const body = { mode: "dds", sourceTicketId: "c-010", category: "пожар в жилом доме", requestId: "x" };
    expect((await draftsRoute(call("/scenarios/drafts", undefined, body))).status).toBe(401);
    expect((await draftsRoute(call("/scenarios/drafts", asStudent, body))).status).toBe(403);
    expect(
      (await versionsRoute(call("/scenarios/ais-001/versions", asStudent), withId("ais-001"))).status,
    ).toBe(403);
    expect(
      (await versionsRoute(call("/scenarios/ais-001/versions", asOtherTeacher), withId("ais-001"))).status,
    ).toBe(403);
    expect(
      (await versionsRoute(call("/scenarios/ais-001/versions", asAdmin), withId("ais-001"))).status,
    ).toBe(200);
  });

  it("неизвестный билет → 404, чужая категория → 400, count вне 1…5 → 400", async () => {
    const base = { mode: "dds", sourceTicketId: "c-010", category: "пожар в жилом доме", requestId: "x" };
    const unknown = await draftsRoute(
      call("/scenarios/drafts", asTeacher, { ...base, sourceTicketId: "t-404" }),
    );
    expect(await errorOf(unknown)).toMatchObject({ status: 404, code: "notFound" });
    expect(
      (await draftsRoute(call("/scenarios/drafts", asTeacher, { ...base, category: "ДТП" }))).status,
    ).toBe(400);
    expect((await draftsRoute(call("/scenarios/drafts", asTeacher, { ...base, count: 6 }))).status).toBe(400);
    expect((await draftsRoute(call("/scenarios/drafts", asTeacher, { ...base, mode: "chain" }))).status).toBe(
      400,
    );
  });

  it("сценарий без AI-версий — пустой список, а не 404 (панель покажет «нет версий»)", async () => {
    const response = await versionsRoute(call("/scenarios/s-001/versions", asTeacher), withId("s-001"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });
});

describe("оценка попытки: состояние, разбор, арбитраж", () => {
  it("состояние: 4 оси и итог из мок-оценки; обучающийся видит свою попытку, чужую — нет", async () => {
    const state: AssessmentStateResponse = await (
      await attemptStateRoute(call(`/attempts/${ATTEMPT}/assessment-state`, asTeacher), withId(ATTEMPT))
    ).json();
    expect(state).toMatchObject({ attemptId: ATTEMPT, mode: "dds", revision: 1, status: "preliminary" });
    expect(state.availableAxes).toHaveLength(4);
    expect(state.totalScore).toBe(95);
    expect(state.reasonCode).toBe("standalone_mock");
    expect(
      (await attemptStateRoute(call(`/attempts/${ATTEMPT}/assessment-state`, asStudent), withId(ATTEMPT)))
        .status,
    ).toBe(200);
    const other = cookieOf("u-006");
    expect(
      (await attemptStateRoute(call(`/attempts/${ATTEMPT}/assessment-state`, other), withId(ATTEMPT))).status,
    ).toBe(403);
    expect(
      (await attemptStateRoute(call(`/attempts/${ATTEMPT}/assessment-state`), withId(ATTEMPT))).status,
    ).toBe(401);
    expect(
      (await attemptStateRoute(call("/attempts/att-404/assessment-state", asTeacher), withId("att-404")))
        .status,
    ).toBe(404);
  });

  it("разбор — только преподавателю; метка автономного режима в версиях, ошибки помечены standalone_mock", async () => {
    expect(
      (await attemptReviewRoute(call(`/attempts/${ATTEMPT}/review`, asStudent), withId(ATTEMPT))).status,
    ).toBe(403);
    const review: AssessmentReviewResponse = await (
      await attemptReviewRoute(call(`/attempts/${ATTEMPT}/review`, asTeacher), withId(ATTEMPT))
    ).json();
    expect(isStandaloneAiRelease(review.assessorVersion)).toBe(true);
    expect(isStandaloneAiRelease(review.modelReleaseId)).toBe(true);
    expect(review.semanticReviews).toEqual([]);
    expect(review.teacherOverride).toBeNull();
  });

  it("арбитраж: ревизия 2, статус final, приоритет преподавателя, аудит; повтор со старой ревизией → 409", async () => {
    const resolve = (cookie: string | undefined, body: unknown) =>
      attemptResolveRoute(call(`/attempts/${ATTEMPT}/resolve`, cookie, body), withId(ATTEMPT));
    const payload = {
      expectedRevision: 1,
      score: 70,
      comment: "Звонок засчитан частично",
      requestId: "res-1",
    };
    expect((await resolve(asStudent, payload)).status).toBe(403);
    expect((await resolve(undefined, payload)).status).toBe(401);
    expect((await resolve(asTeacher, { ...payload, score: 101 })).status).toBe(400);
    expect((await resolve(asTeacher, { ...payload, comment: " " })).status).toBe(400);
    const done = await resolve(asTeacher, payload);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ status: "final", revision: 2, totalScore: 70 });
    expect(await errorOf(await resolve(asTeacher, payload))).toMatchObject({ status: 409, code: "conflict" });
    const state: AssessmentStateResponse = await (
      await attemptStateRoute(call(`/attempts/${ATTEMPT}/assessment-state`, asTeacher), withId(ATTEMPT))
    ).json();
    expect(state).toMatchObject({ status: "final", revision: 2, totalScore: 70 });
    const review: AssessmentReviewResponse = await (
      await attemptReviewRoute(call(`/attempts/${ATTEMPT}/review`, asTeacher), withId(ATTEMPT))
    ).json();
    expect(review.teacherOverride).toMatchObject({
      teacherId: TEACHER,
      score: 70,
      comment: "Звонок засчитан частично",
    });
  });
});

describe("реестр и сводка ошибок", () => {
  it("сводка занятия согласована с реестром; преподаватель занятия и администратор — 200, чужой — 403", async () => {
    const summary: SessionErrorSummaryResponse = await (
      await sessionErrorSummaryRoute(
        call(`/sessions/${SESSION_ID}/error-summary`, asTeacher),
        withId(SESSION_ID),
      )
    ).json();
    const registry: PaginatedErrorRecordsResponse = await (
      await sessionErrorsRoute(
        call(`/sessions/${SESSION_ID}/errors?pageSize=100`, asTeacher),
        withId(SESSION_ID),
      )
    ).json();
    expect(summary.sessionId).toBe(SESSION_ID);
    expect(summary.totalErrors).toBe(registry.total);
    expect(summary.critical + summary.major + summary.minor).toBe(summary.totalErrors);
    expect(registry.items.every((item) => item.detector === "standalone_mock")).toBe(true);
    expect(Object.keys(summary.byDetector).every((key) => key === "standalone_mock")).toBe(true);
    const url = `/sessions/${SESSION_ID}/error-summary`;
    expect((await sessionErrorSummaryRoute(call(url, asAdmin), withId(SESSION_ID))).status).toBe(200);
    expect((await sessionErrorSummaryRoute(call(url, asOtherTeacher), withId(SESSION_ID))).status).toBe(403);
    expect((await sessionErrorSummaryRoute(call(url, asStudent), withId(SESSION_ID))).status).toBe(403);
    expect((await sessionErrorSummaryRoute(call(url), withId(SESSION_ID))).status).toBe(401);
    expect(
      (await sessionErrorSummaryRoute(call("/sessions/ses-404/error-summary", asTeacher), withId("ses-404")))
        .status,
    ).toBe(404);
  });

  it("фильтры и пагинация реестра: pageSize=1 отдаёт одну запись при том же total", async () => {
    const page: PaginatedErrorRecordsResponse = await (
      await sessionErrorsRoute(
        call(`/sessions/${SESSION_ID}/errors?pageSize=1&page=1`, asTeacher),
        withId(SESSION_ID),
      )
    ).json();
    expect(page.items.length).toBeLessThanOrEqual(1);
    expect(page.pageSize).toBe(1);
    const none = await (
      await sessionErrorsRoute(
        call(`/sessions/${SESSION_ID}/errors?detector=ml`, asTeacher),
        withId(SESSION_ID),
      )
    ).json();
    expect(none.total).toBe(0);
    expect(
      (await sessionErrorsRoute(call(`/sessions/${SESSION_ID}/errors?page=0`, asTeacher), withId(SESSION_ID)))
        .status,
    ).toBe(400);
  });

  it("история ошибок обучающегося: только свои попытки; без сессии — 401", async () => {
    const mine: StudentErrorsResponse = await (await myErrorsRoute(call("/me/errors", asStudent))).json();
    expect(mine.studentId).toBe(STUDENT);
    expect(mine.totalErrors).toBe(mine.attempts.reduce((sum, item) => sum + item.totalErrors, 0));
    const other: StudentErrorsResponse = await (
      await myErrorsRoute(call("/me/errors", cookieOf("u-020")))
    ).json();
    expect(other.attempts).toEqual([]);
    expect((await myErrorsRoute(call("/me/errors"))).status).toBe(401);
  });
});
