import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerRequiredError } from "../client";
import {
  createAssignment,
  finishAssignment,
  getAssignment,
  listAssignments,
  startAssignment,
} from "./assignments";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(status: number, payload: unknown): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: FetchMock) {
  const [input, init] = fetchMock.mock.calls[0];
  const url = new URL(String(input), "http://localhost");
  return { url, method: init?.method ?? "GET", body: init?.body as string | undefined };
}

const OPERATOR_ATTEMPT = {
  id: "att-100",
  cardId: "c-010",
  studentId: "u-005",
  aon: "9161263471",
  incidentNumber: 4,
  createdAt: "2026-09-29T10:00:00+03:00",
  openedAt: "2026-09-29T10:00:00+03:00",
  state: "ringing",
  events: [],
  replays: 0,
  hintsShown: 0,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("клиент заданий /api/v1/assignments", () => {
  it("listAssignments: GET /api/v1/assignments с фильтрами", async () => {
    const fetchMock = stubFetch(200, []);
    await listAssignments({ state: "active", studentId: "u-005" });
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/assignments");
    expect(url.searchParams.get("state")).toBe("active");
    expect(url.searchParams.get("studentId")).toBe("u-005");
  });

  it("getAssignment: id кодируется, ответ возвращается как есть", async () => {
    const detail = { id: "asg-002", progress: [] };
    const fetchMock = stubFetch(200, detail);
    expect(await getAssignment("asg 002")).toEqual(detail);
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/assignments/asg%20002");
  });

  it("startAssignment: попытка режима 112 → kind operator112; POST без тела", async () => {
    const fetchMock = stubFetch(200, { attempt: OPERATOR_ATTEMPT });
    const result = await startAssignment("asg-001");
    expect(result).toEqual({ kind: "operator112", attempt: OPERATOR_ATTEMPT });
    const { url, method, body } = sent(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/assignments/asg-001/start");
    expect(body).toBeUndefined();
  });

  it("startAssignment: форма { sessionId, attempt, created } → kind dds; studentId уходит в теле", async () => {
    const ddsAttempt = { id: "att-200", cardId: "c-028", studentId: "u-005" };
    const fetchMock = stubFetch(200, { attempt: { sessionId: "ses-9", attempt: ddsAttempt, created: true } });
    const result = await startAssignment("asg-005", "u-005");
    expect(result).toEqual({ kind: "dds", sessionId: "ses-9", attempt: ddsAttempt, created: true });
    expect(JSON.parse(sent(fetchMock).body ?? "{}")).toEqual({ studentId: "u-005" });
  });

  it("startAssignment: 409 сервера доходит дословно (ApiError с русским сообщением)", async () => {
    stubFetch(409, { error: { code: "conflict", message: "Все билеты задания уже выполнены" } });
    await expect(startAssignment("asg-001")).rejects.toMatchObject({
      status: 409,
      code: "conflict",
      message: "Все билеты задания уже выполнены",
    });
  });

  it("finishAssignment: POST /finish; 403 обучающегося — ApiError forbidden", async () => {
    const fetchMock = stubFetch(403, {
      error: { code: "forbidden", message: "Задание завершает его преподаватель" },
    });
    await expect(finishAssignment("asg-001")).rejects.toMatchObject({ status: 403, code: "forbidden" });
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/assignments/asg-001/finish");
  });

  it("без бэкенда (404 без тела { error }) — ServerRequiredError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("", { status: 404 })),
    );
    await expect(listAssignments()).rejects.toBeInstanceOf(ServerRequiredError);
  });

  it("createAssignment: POST /assignments с телом как есть; 201 → задание", async () => {
    const created = { id: "asg-010", state: "active" };
    const fetchMock = stubFetch(201, created);
    const body = {
      studentIds: ["u-005"],
      trainingMode: "operator112" as const,
      format: "exam" as const,
      randomRule: { groups: ["Пожар"], difficulty: [2, 3], count: 5 },
      params: { passThreshold: 70, timeLimitSec: 600 },
    };
    expect(await createAssignment(body)).toEqual(created);
    const { url, method, body: raw } = sent(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/assignments");
    expect(JSON.parse(String(raw))).toEqual(body);
  });

  it("createAssignment: 400 и 403 сервера доходят дословно", async () => {
    stubFetch(400, { error: { code: "validation", message: "Укажите либо cardIds, либо randomRule" } });
    await expect(
      createAssignment({ studentIds: ["u-005"], trainingMode: "dds", format: "training" }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Укажите либо cardIds, либо randomRule",
    });
    stubFetch(403, {
      error: { code: "forbidden", message: "Нельзя назначать от имени другого преподавателя" },
    });
    await expect(
      createAssignment({ studentIds: ["u-005"], trainingMode: "dds", format: "training", cardIds: ["c-1"] }),
    ).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });
});
