// @vitest-environment node
/*
 * Контрактный прогон «занятие → попытки → отчёт» на реальных route handlers (Playwright в проекте нет):
 * мастер занятия → работа курсанта (попытка, статусы, ручной ввод, завершение) → «Завершить занятие» →
 * «Сформировать отчёт» → GET /reports (те же структуры, что у статики) и GET /reports/journal
 * («сформирован за N сек») → правка оценки преподавателем → обратная связь курсанту.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST as attemptRoute } from "../../../../../app/api/mock/cards/[id]/attempt/route";
import { POST as evaluationOverrideRoute } from "../../../../../app/api/mock/attempts/[id]/evaluation/route";
import { POST as progressRoute } from "../../../../../app/api/mock/attempts/[id]/progress/route";
import { POST as feedbackRoute } from "../../../../../app/api/mock/reports/feedback/route";
import { GET as journalRoute } from "../../../../../app/api/mock/reports/journal/route";
import { GET as reportsRoute } from "../../../../../app/api/mock/reports/route";
import { POST as controlRoute } from "../../../../../app/api/mock/sessions/[id]/control/route";
import { POST as createSessionRoute } from "../../../../../app/api/mock/sessions/route";
import { POST as startRoute } from "../../../../../app/api/mock/sessions/[id]/start/route";
import { POST as stopRoute } from "../../../../../app/api/mock/sessions/[id]/stop/route";
import type {
  CardAttemptResponse,
  Evaluation,
  ReportFeedback,
  ReportJournalResponse,
  ReportsResponse,
  Session,
} from "../../types";
import { resetMockStore } from "../store";

const TEACHER_ID = "u-002";
/** Курсант без профильной привязки — в расписание попадают все карточки сценария. */
const STUDENT_ID = "u-013";
const STATIC_SESSION = "ses-2026-09-16-01";
const STATIC_REPORT = "rep-2026-09-16-01-u-005";

const STARTED_AT = "2026-09-19T12:00:00+03:00";
/** Открытие карточки: реакция 20 с при нормативе 30 с (ТЗ §7). */
const OPENED_AT = "2026-09-19T12:00:20+03:00";
/** Завершение отработки: 120 с при нормативе 180 с. */
const COMPLETED_AT = "2026-09-19T12:02:20+03:00";
const FINISHED_AT = "2026-09-19T12:05:00+03:00";
/** «Сформировать отчёт» — через 4 с после завершения занятия (норматив ТЗ §7 — не более 30 с). */
const REPORTED_AT = "2026-09-19T12:05:04+03:00";
const REPORT_NORM_SEC = 30;

const WIZARD = {
  teacherId: TEACHER_ID,
  studentIds: [STUDENT_ID],
  scenarioIds: ["s-031"],
  mode: "practice",
  cardSource: "generated",
  plan: {
    categories: [],
    issueOrder: "manual",
    hints: false,
    timeNorms: { primaryReactionSec: 30, fullProcessingSec: 180 },
    maxGrammarErrors: 1,
    paceSec: 600,
    conveyor: false,
  },
};

type IdHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function post(handler: IdHandler, url: string, id: string, body?: unknown): Promise<Response> {
  const request = new Request(`http://localhost/api/mock${url}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

function getReports(query: string, cookie?: string): Promise<Response> {
  return reportsRoute(
    new Request(`http://localhost/api/mock/reports${query}`, { headers: cookie ? { cookie } : {} }),
  );
}

/** Мок-сессия курсанта (cookie arm112_session) — источник истины изоляции (T2.5-01). */
function studentCookie(userId: string): string {
  const session = { userId, role: "student", token: `mock-${userId}`, twoFactorUsed: true };
  return `arm112_session=${encodeURIComponent(JSON.stringify({ ...session, issuedAt: new Date().toISOString() }))}`;
}

async function json<TBody>(response: Response): Promise<TBody> {
  return (await response.json()) as TBody;
}

/** Мастер занятия + запуск: возвращает занятие с расписанием выдачи. */
async function createRunningSession(): Promise<Session> {
  const created = await json<Session>(
    await createSessionRoute(
      new Request("http://localhost/api/mock/sessions", { method: "POST", body: JSON.stringify(WIZARD) }),
    ),
  );
  return json<Session>(await post(startRoute, `/sessions/${created.id}/start`, created.id));
}

/** Работа курсанта по первой выданной карточке: открытие, статусы, ручной ввод, завершение. */
async function workOnFirstCard(session: Session, enteredText: Record<string, string>): Promise<string> {
  const issued = session.cardFlow[0];
  vi.setSystemTime(new Date(OPENED_AT));
  const opened = await json<CardAttemptResponse>(
    await post(attemptRoute, `/cards/${issued.cardId}/attempt`, issued.cardId, {
      studentId: STUDENT_ID,
      issuedAt: issued.issuedAt,
    }),
  );
  const attemptId = opened.attempt.id;
  for (const ddsStatus of ["accepted", "workDone"]) {
    await post(progressRoute, `/attempts/${attemptId}/progress`, attemptId, {
      status: { ddsStatus, at: OPENED_AT },
    });
  }
  await post(progressRoute, `/attempts/${attemptId}/progress`, attemptId, {
    enteredText,
    completedAt: COMPLETED_AT,
  });
  return attemptId;
}

/** «Завершить занятие» → «Сформировать отчёт» (finished → reported). */
async function finishAndReport(sessionId: string): Promise<void> {
  vi.setSystemTime(new Date(FINISHED_AT));
  await post(stopRoute, `/sessions/${sessionId}/stop`, sessionId);
  vi.setSystemTime(new Date(REPORTED_AT));
  await post(controlRoute, `/sessions/${sessionId}/control`, sessionId, { action: "report" });
}

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(STARTED_AT));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("отчёт занятия, проведённого в этом процессе", () => {
  it("GET /reports отдаёт те же структуры, что и статика: тайминги, ошибки, графики, групповой свод", async () => {
    const session = await createRunningSession();
    const attemptId = await workOnFirstCard(session, {
      dispatcherAction: "Сообщение пренято, наряд полиции направлен",
      outfitNumber: "102-17",
    });
    await finishAndReport(session.id);

    const body = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(body.reports).toHaveLength(1);
    const [report] = body.reports;
    expect(report).toMatchObject({ sessionId: session.id, exportFormats: ["csv", "pdf"] });
    expect(report.student.studentId).toBe(STUDENT_ID);
    expect(report.generatedAt).toBe(REPORTED_AT);
    // Этапы против нормативов 30 / 180 сек (ТЗ §7).
    expect(report.timeMetrics).toEqual([
      expect.objectContaining({ stage: "Первичная реакция", normMs: 30_000, factMs: 20_000 }),
      expect.objectContaining({ stage: "Полная отработка", normMs: 180_000, factMs: 120_000 }),
    ]);
    // Грамматика ручного ввода — shared/lib/grammar-check через оценку попытки.
    expect(report.grammarErrors).toEqual([
      expect.objectContaining({ wrong: "пренято", expected: "принято", type: "spelling" }),
    ]);
    expect(report.score).toBeGreaterThan(0);
    expect(report.charts.byStage.attempts).toEqual([
      { attemptId, cardId: session.cardFlow[0].cardId, factMs: [20_000, 120_000] },
    ]);
    expect(report.charts.byErrorType.grammar.spelling).toBe(1);
    expect(report.charts.dynamics).toEqual({ labels: [attemptId], scores: [report.score] });
    expect(report.aiComment).toContain("отработано карточек — 1");

    expect(body.groupReport?.sessionId).toBe(session.id);
    expect(body.groupReport?.reportIds).toEqual([report.id]);
    expect(body.groupReport?.groupInsights.length).toBeGreaterThan(0);
    expect(Object.keys(body.groupReport?.charts ?? {})).toEqual([
      "scoreByStudent",
      "reactionByAttempt",
      "errorsByCriterion",
    ]);
  });

  it("журнал отчётов: «сформирован за N сек» честный и укладывается в норматив ТЗ §7", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    await finishAndReport(session.id);

    const journal = await json<ReportJournalResponse>(
      await journalRoute(new Request(`http://localhost/api/mock/reports/journal?teacherId=${TEACHER_ID}`)),
    );
    const row = journal.rows.find((item) => item.sessionId === session.id);
    expect(row?.status).toBe("ready");
    expect(row?.generatedAt).toBe(REPORTED_AT);
    expect(row?.buildSec).toBe(4);
    expect(row?.buildSec ?? 0).toBeLessThanOrEqual(REPORT_NORM_SEC);
    expect(row?.averageScore).toBeGreaterThan(0);
  });

  it("повторный запрос не дублирует и не пересоздаёт отчёт (идемпотентность)", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    await finishAndReport(session.id);

    const first = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    vi.setSystemTime(new Date("2026-09-19T12:30:00+03:00"));
    const second = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(second).toEqual(first);
  });

  it("правка оценки преподавателем пересчитывает балл отчёта и сохраняется", async () => {
    const session = await createRunningSession();
    const attemptId = await workOnFirstCard(session, {
      dispatcherAction: "Сообщение принято",
      outfitNumber: "102-17",
    });
    await finishAndReport(session.id);
    const before = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));

    const override = await json<Evaluation>(
      await post(evaluationOverrideRoute, `/attempts/${attemptId}/evaluation`, attemptId, {
        teacherId: TEACHER_ID,
        score: 55,
        comment: "Пропущено уточнение адреса",
      }),
    );
    expect(override.teacherOverride).toMatchObject({ score: 55, by: TEACHER_ID });

    const after = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(after.reports[0].id).toBe(before.reports[0].id);
    expect(after.reports[0].generatedAt).toBe(before.reports[0].generatedAt);
    expect(after.reports[0].score).toBe(55);
    expect(after.reports[0].charts.dynamics.scores).toEqual([55]);
  });

  it("обратная связь работает по id рантайм-отчёта и видна в GET /reports", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    await finishAndReport(session.id);
    const [report] = (await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`))).reports;

    const response = await feedbackRoute(
      new Request("http://localhost/api/mock/reports/feedback", {
        method: "POST",
        body: JSON.stringify({
          reportId: report.id,
          teacherId: TEACHER_ID,
          text: "Отработайте уточнение адреса",
          recommendations: ["Повторить опросную карту"],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const feedback = await json<ReportFeedback>(response);
    expect(feedback).toMatchObject({ reportId: report.id, studentId: STUDENT_ID, by: TEACHER_ID });

    const after = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(after.reports[0].teacherFeedback?.text).toBe("Отработайте уточнение адреса");
  });

  it("занятие без попыток → отчёт с честным «нет данных по попыткам»", async () => {
    const session = await createRunningSession();
    await finishAndReport(session.id);

    const body = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(body.reports).toHaveLength(1);
    expect(body.reports[0].aiComment).toContain("Нет данных по попыткам");
    expect(body.reports[0].timeMetrics).toEqual([]);
    expect(body.reports[0].charts.dynamics).toEqual({ labels: [], scores: [] });
    expect(body.groupReport?.groupInsights[0]).toContain("Нет данных по попыткам");
  });

  it("отчёт формируется лениво и для завершённого занятия без действия «Сформировать отчёт»", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    vi.setSystemTime(new Date(FINISHED_AT));
    await post(stopRoute, `/sessions/${session.id}/stop`, session.id);

    const body = await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`));
    expect(body.reports).toHaveLength(1);
    expect(body.groupReport).not.toBeNull();
  });

  it("идущее занятие отчёта не даёт", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    expect(await json<ReportsResponse>(await getReports(`?sessionId=${session.id}`))).toEqual({
      reports: [],
      groupReport: null,
    });
  });

  it("курсант видит свой рантайм-отчёт по studentId, чужой → 403, групповой свод не отдаётся", async () => {
    const session = await createRunningSession();
    await workOnFirstCard(session, { dispatcherAction: "Сообщение принято", outfitNumber: "102-17" });
    await finishAndReport(session.id);

    const own = await json<ReportsResponse>(
      await getReports(`?studentId=${STUDENT_ID}`, studentCookie(STUDENT_ID)),
    );
    expect(own.reports.map((report) => report.sessionId)).toEqual([session.id]);
    expect(own.groupReport).toBeNull();
    expect((await getReports("?studentId=u-005", studentCookie(STUDENT_ID))).status).toBe(403);
  });

  it("статические отчёты занятия 16.09 не подменяются и не пересоздаются", async () => {
    const before = await json<ReportsResponse>(await getReports(`?sessionId=${STATIC_SESSION}`));
    expect(before.reports.map((report) => report.id)).toEqual([
      STATIC_REPORT,
      "rep-2026-09-16-01-u-006",
      "rep-2026-09-16-01-u-007",
    ]);
    expect(before.groupReport?.id).toBe("rep-2026-09-16-group");

    await post(controlRoute, `/sessions/${STATIC_SESSION}/control`, STATIC_SESSION, { action: "report" });
    const after = await json<ReportsResponse>(await getReports(`?sessionId=${STATIC_SESSION}`));
    expect(after.reports).toEqual(before.reports);
    expect(after.groupReport).toEqual(before.groupReport);
  });
});
