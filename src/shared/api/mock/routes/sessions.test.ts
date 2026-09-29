// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as feedRoute } from "../../../../../app/api/mock/sessions/[id]/feed/route";
import { POST as startRoute } from "../../../../../app/api/mock/sessions/[id]/start/route";
import { POST as stopRoute } from "../../../../../app/api/mock/sessions/[id]/stop/route";
import { GET as listRoute, POST as createRoute } from "../../../../../app/api/mock/sessions/route";
import type { ApiErrorBody, Session, SessionFeedResponse } from "../../types";
import { readSessions } from "../readers";
import { buildSessionCookie } from "../session-cookie";
import { resetMockStore } from "../store";

const FINISHED_ID = "ses-2026-09-16-01";
const RUNNING_ID = "ses-2026-09-17-demo";
const NOW = "2026-09-19T12:00:00+03:00";

/** Мок-сессия запроса (подписанная cookie arm112_session) — источник истины о зрителе ленты. */
function sessionCookie(userId: string): string {
  return buildSessionCookie(userId);
}

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function callById(handler: Handler, id: string, query = ""): Promise<Response> {
  const request = new Request(`http://localhost/api/mock/sessions/${id}${query}`, { method: "GET" });
  return handler(request, { params: Promise.resolve({ id }) });
}

function create(body: unknown): Promise<Response> {
  return createRoute(
    new Request("http://localhost/api/mock/sessions", { method: "POST", body: JSON.stringify(body) }),
  );
}

const wizard = {
  teacherId: "u-002",
  studentIds: ["u-005", "u-006"],
  scenarioIds: ["s-001"],
  mode: "practice",
  cardSource: "generated",
};

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET/POST /api/mock/sessions", () => {
  it("список с фильтрами state / studentId", async () => {
    const all: Session[] = await (await listRoute(new Request("http://localhost/api/mock/sessions"))).json();
    expect(all).toHaveLength(readSessions().length);
    const running: Session[] = await (
      await listRoute(new Request("http://localhost/api/mock/sessions?state=running"))
    ).json();
    expect(running.map((session) => session.id)).toEqual([RUNNING_ID]);
    expect((await listRoute(new Request("http://localhost/api/mock/sessions?state=x"))).status).toBe(400);
  });

  it("создание по мастеру → 201 configured", async () => {
    const response = await create(wizard);
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: "ses-001",
      state: "configured",
      finishedAt: null,
      cardEvents: [],
    });
  });

  it.each([
    ["неизвестный курсант", { studentIds: ["u-005", "u-999"] }],
    ["преподаватель вместо курсанта", { studentIds: ["u-002"] }],
    ["неизвестный сценарий", { scenarioIds: ["s-999"] }],
    ["не-approved сценарий", { scenarioIds: ["s-033"] }],
    ["неизвестный режим", { mode: "exam" }],
  ])("%s → 400", async (_label, patch) => {
    const response = await create({ ...wizard, ...patch });
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("validationFailed");
  });
});

describe("POST /sessions/[id]/start и /stop", () => {
  it("configured → running (startedAt +03:00, расписание по умолчанию) → finished; повторный start → 409", async () => {
    const created: Session = await (await create(wizard)).json();
    const started: Session = await (await callById(startRoute, created.id)).json();
    expect(started).toMatchObject({ state: "running", startedAt: NOW });
    expect(started.cardFlow).toHaveLength(wizard.studentIds.length * 3);
    const stopped: Session = await (await callById(stopRoute, created.id)).json();
    expect(stopped).toMatchObject({ state: "finished", finishedAt: NOW });
    const again = await callById(startRoute, created.id);
    expect(again.status).toBe(409);
    expect(((await again.json()) as ApiErrorBody).error.code).toBe("invalidTransition");
  });

  it("stop идущего занятия в любой момент; stop не-running → 409; неизвестный id → 404", async () => {
    expect((await callById(stopRoute, RUNNING_ID)).status).toBe(200);
    expect((await callById(stopRoute, FINISHED_ID)).status).toBe(409);
    expect((await callById(startRoute, "ses-nope")).status).toBe(404);
  });
});

describe("GET /sessions/[id]/feed", () => {
  const running = readSessions().find((session) => session.id === RUNNING_ID)!;
  const issued = running.cardFlow.map((item) => item.issuedAt).sort();

  it("at между двумя issuedAt → только выдачи с issuedAt ≤ at", async () => {
    const at = issued[1];
    const body: SessionFeedResponse = await (
      await callById(feedRoute, RUNNING_ID, `?at=${encodeURIComponent(at)}`)
    ).json();
    expect(body.at).toBe(at);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((event) => event.kind === "cardIssued" && event.at <= at)).toBe(true);
    expect(body.events).toHaveLength(issued.filter((value) => value <= at).length);
  });

  it("окно (since, at]: since исключается", async () => {
    const [first] = issued;
    const query = `?since=${encodeURIComponent(first)}&at=${encodeURIComponent(issued.at(-1)!)}`;
    const body: SessionFeedResponse = await (await callById(feedRoute, RUNNING_ID, query)).json();
    expect(body.events.every((event) => event.at > first)).toBe(true);
  });

  it("finished занятие без at → полный feed всех 5 видов (at = серверное «сейчас», T1.2-05)", async () => {
    const body: SessionFeedResponse = await (await callById(feedRoute, FINISHED_ID)).json();
    const finished = readSessions().find((session) => session.id === FINISHED_ID)!;
    expect(body.at).toBe(NOW);
    const attemptEvents = finished.cardEvents.reduce(
      (sum, attempt) => sum + 2 + attempt.statuses.length + (attempt.evaluation ? 1 : 0),
      0,
    );
    expect(body.events).toHaveLength(finished.cardFlow.length + attemptEvents);
    expect(new Set(body.events.map((event) => event.kind))).toEqual(
      new Set(["cardIssued", "cardOpened", "statusChanged", "cardCompleted", "aiEvaluation"]),
    );
    const times = body.events.map((event) => Date.parse(event.at));
    expect(times).toEqual([...times].sort((left, right) => left - right));
    const completed = body.events.find((event) => event.kind === "cardCompleted");
    expect(completed && "fullProcessingMs" in completed && completed.fullProcessingMs).toBeGreaterThan(0);
  });

  it("неизвестный id → 404; мусорная метка → 400", async () => {
    expect((await callById(feedRoute, "ses-nope")).status).toBe(404);
    expect((await callById(feedRoute, RUNNING_ID, "?at=вчера")).status).toBe(400);
  });
});

describe("GET /sessions/[id]/feed — доступ монитора (T3.3-09)", () => {
  function callAs(id: string, cookie: string, query = ""): Promise<Response> {
    const request = new Request(`http://localhost/api/mock/sessions/${id}/feed${query}`, {
      headers: { cookie },
    });
    return feedRoute(request, { params: Promise.resolve({ id }) });
  }

  it("преподаватель своего занятия — 200; чужого преподавателя — 403", async () => {
    expect((await callAs(RUNNING_ID, sessionCookie("u-002"))).status).toBe(200);
    const foreign = await callAs(RUNNING_ID, sessionCookie("u-003"));
    expect(foreign.status).toBe(403);
    expect(((await foreign.json()) as ApiErrorBody).error.code).toBe("forbidden");
  });

  it("studentId сужает ленту до одного курсанта (экран монитора)", async () => {
    const query = `?studentId=u-006`;
    const body: SessionFeedResponse = await (await callAs(RUNNING_ID, sessionCookie("u-002"), query)).json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.events.every((event) => event.studentId === "u-006")).toBe(true);
  });

  it("обучающемуся — только свои события; чужой studentId → 403; чужое занятие → 403", async () => {
    const asStudent = sessionCookie("u-005");
    const body: SessionFeedResponse = await (await callAs(RUNNING_ID, asStudent)).json();
    expect(body.events.every((event) => event.studentId === "u-005")).toBe(true);
    expect((await callAs(RUNNING_ID, asStudent, "?studentId=u-006")).status).toBe(403);
    expect((await callAs(RUNNING_ID, sessionCookie("u-015"))).status).toBe(403);
  });
});
