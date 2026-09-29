// @vitest-environment node
/* Контракт изоляции «только свои результаты» (T2.5-01; ТЗ §8): studentId — из мок-сессии, не из query. */
import { beforeEach, describe, expect, it } from "vitest";

import { GET as evaluationRoute } from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import { GET as reportsRoute } from "../../../../../app/api/mock/reports/route";
import { GET as sessionsRoute } from "../../../../../app/api/mock/sessions/route";
import type { ApiErrorBody, Evaluation, ReportsResponse, Session } from "../../types";
import { buildSessionCookie } from "../session-cookie";
import { resetMockStore } from "../store";

const STUDENT_ID = "u-005";
const OTHER_STUDENT_ID = "u-006";
const FINISHED_ID = "ses-2026-09-16-01";
const DAY_MS = 24 * 60 * 60 * 1000;

function sessionCookie(userId: string, issuedAtMs = Date.now()): string {
  return `theme=dark; ${buildSessionCookie(userId, { issuedAtMs })}`;
}

function request(path: string, cookie?: string): Request {
  return new Request(`http://localhost/api/mock${path}`, { headers: cookie ? { cookie } : {} });
}

const asStudent = sessionCookie(STUDENT_ID);
const asTeacher = sessionCookie("u-002");

function evaluation(id: string, cookie?: string): Promise<Response> {
  return evaluationRoute(request(`/attempts/${id}/evaluation`, cookie), { params: Promise.resolve({ id }) });
}

async function errorCode(response: Response): Promise<string> {
  return ((await response.json()) as ApiErrorBody).error.code;
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /reports — фильтр по studentId из сессии", () => {
  it("обучающийся без query получает только свои отчёты, без группового", async () => {
    const response = await reportsRoute(request("/reports", asStudent));
    expect(response.status).toBe(200);
    const body: ReportsResponse = await response.json();
    expect(body.reports.length).toBeGreaterThan(0);
    expect(body.reports.every((report) => report.student.studentId === STUDENT_ID)).toBe(true);
    expect(body.groupReport).toBeNull();
  });

  it("свой studentId в query — 200; чужой — 403 forbidden", async () => {
    expect((await reportsRoute(request(`/reports?studentId=${STUDENT_ID}`, asStudent))).status).toBe(200);
    const foreign = await reportsRoute(request(`/reports?studentId=${OTHER_STUDENT_ID}`, asStudent));
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe("forbidden");
  });

  it("обучающийся по sessionId не видит отчёты группы — только свой", async () => {
    const body: ReportsResponse = await (
      await reportsRoute(request(`/reports?sessionId=${FINISHED_ID}`, asStudent))
    ).json();
    expect(body.reports.map((report) => report.student.studentId)).toEqual([STUDENT_ID]);
    expect(body.groupReport).toBeNull();
  });

  it("аноним по studentId → 401; истёкшая сессия = аноним", async () => {
    expect((await reportsRoute(request(`/reports?studentId=${STUDENT_ID}`))).status).toBe(401);
    const expired = sessionCookie(STUDENT_ID, Date.now() - DAY_MS - 1000);
    expect((await reportsRoute(request(`/reports?studentId=${STUDENT_ID}`, expired))).status).toBe(401);
  });

  it("преподаватель по studentId получает отчёты курсанта", async () => {
    const body: ReportsResponse = await (
      await reportsRoute(request(`/reports?studentId=${OTHER_STUDENT_ID}`, asTeacher))
    ).json();
    expect(body.reports.map((report) => report.student.studentId)).toEqual([OTHER_STUDENT_ID]);
  });
});

describe("GET /sessions — per-student проекция для обучающегося", () => {
  it("только свои занятия, выдачи и попытки; чужой studentId → 403", async () => {
    const sessions: Session[] = await (await sessionsRoute(request("/sessions", asStudent))).json();
    expect(sessions.length).toBeGreaterThan(0);
    for (const session of sessions) {
      expect(session.studentIds).toEqual([STUDENT_ID]);
      expect(session.cardEvents.every((attempt) => attempt.studentId === STUDENT_ID)).toBe(true);
      expect(session.cardFlow.every((item) => item.studentId === STUDENT_ID)).toBe(true);
    }
    const attemptIds = sessions.flatMap((session) => session.cardEvents.map((attempt) => attempt.id));
    expect(attemptIds).toEqual(["att-01", "att-02"]);
    expect((await sessionsRoute(request(`/sessions?studentId=${OTHER_STUDENT_ID}`, asStudent))).status).toBe(
      403,
    );
  });

  it("преподавателю занятие отдаётся целиком", async () => {
    const sessions: Session[] = await (await sessionsRoute(request("/sessions", asTeacher))).json();
    const finished = sessions.find((session) => session.id === FINISHED_ID);
    expect(finished?.studentIds.length).toBeGreaterThan(1);
  });
});

describe("GET /attempts/[id]/evaluation — только своя попытка", () => {
  it("своя попытка → 200, чужая → 403", async () => {
    const own = await evaluation("att-01", asStudent);
    expect(own.status).toBe(200);
    expect(typeof ((await own.json()) as Evaluation).totalScore).toBe("number");
    const foreign = await evaluation("att-03", asStudent);
    expect(foreign.status).toBe(403);
    expect(await errorCode(foreign)).toBe("forbidden");
  });
});
