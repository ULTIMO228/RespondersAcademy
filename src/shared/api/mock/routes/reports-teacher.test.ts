// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { POST as overrideRoute } from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import { POST as feedbackRoute } from "../../../../../app/api/mock/reports/feedback/route";
import { GET as journalRoute } from "../../../../../app/api/mock/reports/journal/route";
import { GET as reportsRoute } from "../../../../../app/api/mock/reports/route";
import type {
  ApiErrorBody,
  AuditLogEntry,
  Evaluation,
  PageResponse,
  ReportJournalResponse,
  ReportsResponse,
} from "../../types";
import { resetMockStore } from "../store";

const AUDIT_URL = "http://localhost/api/mock/admin/audit";

const SESSION_ID = "ses-2026-09-16-01";
const TEACHER_ID = "u-002";
const REPORT_ID = "rep-2026-09-16-01-u-005";
/** ТЗ §7: отчёт формируется не дольше 30 секунд. */
const REPORT_BUILD_NORM_SEC = 30;

function buildPost(path: string, body: unknown): Request {
  return new Request(`http://localhost/api/mock${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postOverride(id: string, body: unknown): Promise<Response> {
  return overrideRoute(buildPost(`/attempts/${id}/evaluation`, body), {
    params: Promise.resolve({ id }),
  });
}

function postFeedback(body: unknown): Promise<Response> {
  return feedbackRoute(buildPost("/reports/feedback", body));
}

function journal(query = ""): Promise<Response> {
  return journalRoute(new Request(`http://localhost/api/mock/reports/journal${query}`));
}

async function readReports(query: string): Promise<ReportsResponse> {
  return (await reportsRoute(new Request(`http://localhost/api/mock/reports${query}`))).json();
}

beforeEach(() => {
  resetMockStore();
});

describe("POST /api/mock/attempts/[id]/evaluation — правка оценки преподавателем (T3.4-09)", () => {
  it("пересчитывает итог отчёта, сохраняет оценку ИИ рядом и пишет аудит «было/стало»", async () => {
    const before: ReportsResponse = await readReports(`?sessionId=${SESSION_ID}`);
    const ivanov = before.reports.find((report) => report.student.studentId === "u-005");
    expect(ivanov?.score).toBe(96);
    const response = await postOverride("att-02", {
      teacherId: TEACHER_ID,
      score: 70,
      comment: "Звонок 302 засчитан частично",
    });
    expect(response.status).toBe(200);
    const evaluation: Evaluation = await response.json();
    expect(evaluation.teacherOverride).toMatchObject({ score: 70, by: TEACHER_ID });
    // Оценка ИИ остаётся в записи попытки (UI показывает её рядом с бейджем «ИИ»).
    expect(evaluation.totalScore).toBe(95);
    const after: ReportsResponse = await readReports(`?sessionId=${SESSION_ID}`);
    const updated = after.reports.find((report) => report.student.studentId === "u-005");
    // (98 + 70) / 2 = 84
    expect(updated?.score).toBe(84);
    expect(updated?.charts.dynamics.scores).toEqual([98, 70]);
    const auditPage: PageResponse<AuditLogEntry> = await (await auditRoute(new Request(AUDIT_URL))).json();
    const audit = auditPage.items;
    expect(audit[0]).toMatchObject({ userId: TEACHER_ID, action: "evaluation.override" });
    expect(audit[0].details).toContain("было 95 → стало 70");
    expect(audit[0].details).toContain("Морозова Елена Сергеевна");
  });

  it("балл вне 0–100, пустой комментарий и не преподаватель отклоняются", async () => {
    const payload = { teacherId: TEACHER_ID, score: 70, comment: "ок" };
    expect((await postOverride("att-02", { ...payload, score: 120 })).status).toBe(400);
    expect((await postOverride("att-02", { ...payload, comment: "  " })).status).toBe(400);
    const alien = await postOverride("att-02", { ...payload, teacherId: "u-005" });
    expect(alien.status).toBe(403);
    expect(((await alien.json()) as ApiErrorBody).error.code).toBe("forbidden");
    expect((await postOverride("att-99", payload)).status).toBe(404);
  });
});

describe("GET /api/mock/reports/journal — журнал и фильтры (T3.4-02, T3.4-03)", () => {
  it("строки занятий преподавателя со статусом и временем формирования ≤ 30 с", async () => {
    const body: ReportJournalResponse = await (await journal(`?teacherId=${TEACHER_ID}`)).json();
    expect(body.rows).toHaveLength(2);
    const finished = body.rows.find((row) => row.sessionId === SESSION_ID);
    expect(finished).toMatchObject({ status: "ready", averageScore: 85, teacherName: expect.any(String) });
    expect(finished?.groups).toEqual(["ДДС-01"]);
    expect(finished?.categories.length).toBeGreaterThan(0);
    expect(finished?.buildSec).toBeLessThanOrEqual(REPORT_BUILD_NORM_SEC);
    expect(body.rows.find((row) => row.sessionId === "ses-2026-09-17-demo")?.status).toBe("draft");
    expect(body.filters.students.map((student) => student.id)).toContain("u-005");
  });

  it("фильтры «курсант» и «период» сужают журнал, значения фильтров не схлопываются", async () => {
    const filtered: ReportJournalResponse = await (
      await journal(`?teacherId=${TEACHER_ID}&studentId=u-005&from=2026-09-16&to=2026-09-16`)
    ).json();
    expect(filtered.rows.map((row) => row.sessionId)).toEqual([SESSION_ID]);
    expect(filtered.filters.students.length).toBeGreaterThan(1);
    const empty: ReportJournalResponse = await (await journal("?teacherId=u-003")).json();
    expect(empty.rows).toEqual([]);
  });

  it("обучающемуся журнал недоступен (403)", async () => {
    const request = new Request("http://localhost/api/mock/reports/journal", {
      headers: { cookie: `arm112_session=${buildStudentCookie()}` },
    });
    const response = await journalRoute(request);
    expect(response.status).toBe(403);
  });
});

describe("POST /api/mock/reports/feedback — обратная связь курсанту (T3.4-10)", () => {
  it("сохраняется в отчёте курсанта и перезаписывается повторной отправкой", async () => {
    const created = await postFeedback({
      reportId: REPORT_ID,
      teacherId: TEACHER_ID,
      text: "Отработка ровная, держите темп",
      recommendations: ["Повторить регламент первичной обработки"],
    });
    expect(created.status).toBe(201);
    const body: ReportsResponse = await readReports(`?sessionId=${SESSION_ID}`);
    expect(body.reports[0].teacherFeedback).toMatchObject({
      text: "Отработка ровная, держите темп",
      byName: "Морозова Елена Сергеевна",
      studentId: "u-005",
    });
    await postFeedback({ reportId: REPORT_ID, teacherId: TEACHER_ID, text: "Второй вариант" });
    const updated: ReportsResponse = await readReports(`?sessionId=${SESSION_ID}`);
    expect(updated.reports[0].teacherFeedback?.text).toBe("Второй вариант");
  });

  it("пустой комментарий → 400, неизвестный отчёт → 404", async () => {
    const empty = await postFeedback({ reportId: REPORT_ID, teacherId: TEACHER_ID, text: " " });
    expect(empty.status).toBe(400);
    const unknown = await postFeedback({ reportId: "rep-nope", teacherId: TEACHER_ID, text: "ок" });
    expect(unknown.status).toBe(404);
  });
});

/** Cookie мок-сессии обучающегося (формат — entities/user serializeSession). */
function buildStudentCookie(): string {
  return encodeURIComponent(
    JSON.stringify({
      userId: "u-005",
      role: "student",
      token: "mock-u-005",
      twoFactorUsed: true,
      issuedAt: new Date().toISOString(),
    }),
  );
}
