// @vitest-environment node
/*
 * Управление во время занятия (T3.2-11) и переход к отчёту (T3.2-12):
 * GET/POST /api/mock/sessions/[id]/control — пауза выдачи, внеочередная карточка, finished → reported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  GET as controlGet,
  POST as controlPost,
} from "../../../../../app/api/mock/sessions/[id]/control/route";
import { POST as startRoute } from "../../../../../app/api/mock/sessions/[id]/start/route";
import { POST as stopRoute } from "../../../../../app/api/mock/sessions/[id]/stop/route";
import { POST as createRoute } from "../../../../../app/api/mock/sessions/route";
import type { ApiErrorBody, Session, SessionControlRequest, SessionControlResponse } from "../../types";
import { resetMockStore } from "../store";

const NOW = "2026-09-19T12:00:00+03:00";
const LATER = "2026-09-19T12:05:00+03:00";
/** Курсант без профильной привязки — в расписании все карточки сценария. */
const STUDENT = "u-013";
const WIZARD = {
  teacherId: "u-002",
  studentIds: [STUDENT],
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

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function call(handler: Handler, id: string, body?: unknown): Promise<Response> {
  const request = new Request(`http://localhost/api/mock/sessions/${id}/control`, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handler(request, { params: Promise.resolve({ id }) });
}

async function control(id: string, body: SessionControlRequest): Promise<SessionControlResponse> {
  return (await (await call(controlPost, id, body)).json()) as SessionControlResponse;
}

async function createRunning(): Promise<Session> {
  const created = (await (
    await createRoute(
      new Request("http://localhost/api/mock/sessions", { method: "POST", body: JSON.stringify(WIZARD) }),
    )
  ).json()) as Session;
  return (await (await call(startRoute, created.id, {})).json()) as Session;
}

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /sessions/[id]/control", () => {
  it("отдаёт занятие, план мастера и число ещё не выданных карточек", async () => {
    const session = await createRunning();
    const body = (await (await call(controlGet, session.id)).json()) as SessionControlResponse;
    expect(body.session.id).toBe(session.id);
    expect(body.plan).toMatchObject({ paceSec: 600, issueOrder: "manual" });
    expect(body.paused).toBe(false);
    expect(body.pendingCount).toBe(session.cardFlow.length - 1);
  });

  it("неизвестное занятие → 404", async () => {
    expect((await call(controlGet, "ses-nope")).status).toBe(404);
  });
});

describe("пауза выдачи (T3.2-11)", () => {
  it("pause убирает невыданные карточки из расписания, resume возвращает их со сдвигом", async () => {
    const session = await createRunning();
    const pending = session.cardFlow.length - 1;
    const paused = await control(session.id, { action: "pause" });
    expect(paused.paused).toBe(true);
    expect(paused.pausedAt).toBe(NOW);
    expect(paused.session.cardFlow).toHaveLength(1);
    expect(paused.pendingCount).toBe(pending);

    vi.setSystemTime(new Date(LATER));
    const resumed = await control(session.id, { action: "resume" });
    expect(resumed.paused).toBe(false);
    expect(resumed.session.cardFlow).toHaveLength(session.cardFlow.length);
    const shifted = resumed.session.cardFlow.map((item) => item.issuedAt).sort();
    expect(shifted.at(-1)).not.toBe(
      session.cardFlow
        .map((item) => item.issuedAt)
        .sort()
        .at(-1),
    );
  });
});

describe("принудительная выдача карточки (T3.2-11)", () => {
  it("issue добавляет CardFlowItem вне расписания — «сейчас»", async () => {
    const session = await createRunning();
    const before = session.cardFlow.length;
    const issued = await control(session.id, { action: "issue", studentId: STUDENT, cardId: "c-001" });
    expect(issued.session.cardFlow).toHaveLength(before + 1);
    expect(issued.session.cardFlow.at(-1)).toMatchObject({
      cardId: "c-001",
      studentId: STUDENT,
      issuedAt: NOW,
    });
  });

  it("issue без карточки берёт следующую из пула занятия", async () => {
    const session = await createRunning();
    const issued = await control(session.id, { action: "issue", studentId: STUDENT });
    expect(issued.session.cardFlow.at(-1)?.issuedAt).toBe(NOW);
  });

  it.each([
    ["чужой курсант", { action: "issue", studentId: "u-006" }],
    ["без курсанта", { action: "issue" }],
    ["неизвестное действие", { action: "restart" }],
  ])("%s → 400", async (_label, body) => {
    const session = await createRunning();
    const response = await call(controlPost, session.id, body);
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("validationFailed");
  });
});

describe("переход к отчёту (T3.2-12)", () => {
  it("finished → reported; из running переход отклоняется (409)", async () => {
    const session = await createRunning();
    expect((await call(controlPost, session.id, { action: "report" })).status).toBe(409);
    await call(stopRoute, session.id, {});
    const reported = await control(session.id, { action: "report" });
    expect(reported.session.state).toBe("reported");
    expect((await call(controlPost, session.id, { action: "report" })).status).toBe(409);
  });
});
