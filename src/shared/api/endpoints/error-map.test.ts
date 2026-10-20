import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, ServerRequiredError } from "../client";
import type { ErrorMapVerdictRequest } from "../types";
import {
  errorMapPdfUrl,
  errorMapXlsxUrl,
  getErrorMapGroup,
  getErrorMapJournal,
  getErrorMapSettings,
  getErrorMapStage,
  getErrorMapStudent,
  getErrorMapStudentStage,
  getMyFocus,
  listErrorMapGroups,
  saveErrorMapSettings,
  saveErrorMapVerdict,
} from "./error-map";

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function stubFetch(status: number, payload: unknown): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: FetchMock) {
  const [input, init] = fetchMock.mock.calls[0];
  return {
    url: new URL(String(input), "http://localhost"),
    method: init?.method ?? "GET",
    body: init?.body as string | undefined,
  };
}

function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("ожидалась ошибка");
    },
    (error: unknown) => error,
  );
}

const FORBIDDEN_GROUP = { error: { code: "forbidden", message: "Нет доступа к группе / обучающемуся" } };

const SETTINGS = {
  sometimesFrom: 0.1,
  oftenFrom: 0.3,
  minAttemptsGroup: 5,
  minAttemptsStudent: 3,
  sameBandPoints: 10,
};

const VERDICT: ErrorMapVerdictRequest = {
  groupId: "ДДС-01",
  studentId: "u-005",
  mode: "dds",
  period: "1m",
  stageId: "intake",
  textHash: "a1b2c3",
  source: "template",
  verdict: "disagree",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("клиент карты ошибок /api/v1/error-map", () => {
  it("listErrorMapGroups: GET /api/v1/error-map/groups без query", async () => {
    const groups = [{ groupId: "ДДС-01", studentCount: 4 }];
    const fetchMock = stubFetch(200, groups);
    expect(await listErrorMapGroups()).toEqual(groups);
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/error-map/groups");
    expect(url.search).toBe("");
  });

  it("getErrorMapGroup: id группы кодируется в пути, mode и period — в query", async () => {
    const fetchMock = stubFetch(200, { scope: { kind: "group" } });
    await getErrorMapGroup("ДДС-01", { mode: "operator112", period: "2w" });
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/error-map/groups/%D0%94%D0%94%D0%A1-01");
    expect(url.searchParams.get("mode")).toBe("operator112");
    expect(url.searchParams.get("period")).toBe("2w");
  });

  it("getErrorMapGroup без параметров не передаёт mode/period (умолчания — на сервере)", async () => {
    const fetchMock = stubFetch(200, {});
    await getErrorMapGroup("ДДС-01");
    expect(sent(fetchMock).url.search).toBe("");
  });

  it("getErrorMapGroup: чужая группа — 403 с сообщением сервера, не ServerRequiredError", async () => {
    stubFetch(403, FORBIDDEN_GROUP);
    const error = await caught(getErrorMapGroup("ДДС-09"));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Нет доступа к группе / обучающемуся",
    });
  });

  it("getErrorMapStage: GET …/groups/{id}/stages/{stageId} с mode и period", async () => {
    const fetchMock = stubFetch(200, {});
    await getErrorMapStage("ДДС-01", "intake", { mode: "dds", period: "all" });
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/error-map/groups/%D0%94%D0%94%D0%A1-01/stages/intake");
    expect(url.searchParams.get("mode")).toBe("dds");
    expect(url.searchParams.get("period")).toBe("all");
  });

  it("getErrorMapJournal: GET …/groups/{id}/journal; неизвестный 404 остаётся ApiError", async () => {
    const fetchMock = stubFetch(200, { rows: [] });
    await getErrorMapJournal("ДДС-01", { mode: "dds", period: "1m" });
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/error-map/groups/%D0%94%D0%94%D0%A1-01/journal");
    stubFetch(404, { error: { code: "notFound", message: "Группа не найдена" } });
    await expect(getErrorMapJournal("ДДС-99")).rejects.toMatchObject({ status: 404, code: "notFound" });
  });

  it("getErrorMapStudent: id обучающегося кодируется; mode и period уходят в query", async () => {
    const fetchMock = stubFetch(200, {});
    await getErrorMapStudent("u 5", { mode: "operator112", period: "1m" });
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/error-map/students/u%205");
    expect(url.searchParams.get("mode")).toBe("operator112");
    expect(url.searchParams.get("period")).toBe("1m");
  });

  it("getErrorMapStudentStage: GET …/students/{id}/stages/{stageId}", async () => {
    const fetchMock = stubFetch(200, {});
    await getErrorMapStudentStage("u-005", "intake", { mode: "dds" });
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/error-map/students/u-005/stages/intake");
    expect(url.searchParams.get("mode")).toBe("dds");
    expect(url.searchParams.has("period")).toBe(false);
  });

  it("saveErrorMapVerdict: PUT /error-map/verdicts с телом запроса; успех — undefined", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    await expect(saveErrorMapVerdict(VERDICT)).resolves.toBeUndefined();
    const { url, method, body } = sent(fetchMock);
    expect(method).toBe("PUT");
    expect(url.pathname).toBe("/api/v1/error-map/verdicts");
    expect(JSON.parse(body ?? "null")).toEqual(VERDICT);
  });

  it("saveErrorMapVerdict: отказ сервера (400 или 403) — ApiError с текстом сервера", async () => {
    stubFetch(400, { error: { code: "badRequest", message: "Вердикт — «agree» или «disagree»" } });
    await expect(saveErrorMapVerdict(VERDICT)).rejects.toMatchObject({
      status: 400,
      message: "Вердикт — «agree» или «disagree»",
    });
    stubFetch(403, FORBIDDEN_GROUP);
    const error = await caught(saveErrorMapVerdict(VERDICT));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 403, code: "forbidden" });
  });
});

describe("клиент карты ошибок: обучающийся и администратор", () => {
  it("getMyFocus: GET /api/v1/me/focus без параметров", async () => {
    const focus = { mode: "dds", items: [] };
    const fetchMock = stubFetch(200, focus);
    expect(await getMyFocus()).toEqual(focus);
    const { url, method } = sent(fetchMock);
    expect(method).toBe("GET");
    expect(url.pathname).toBe("/api/v1/me/focus");
    expect(url.search).toBe("");
  });

  it("getMyFocus: роль не student — 403 как ApiError", async () => {
    stubFetch(403, { error: { code: "forbidden", message: "Доступно роли student" } });
    await expect(getMyFocus()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("getErrorMapSettings: GET /api/v1/error-map/settings", async () => {
    const fetchMock = stubFetch(200, SETTINGS);
    expect(await getErrorMapSettings()).toEqual(SETTINGS);
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/error-map/settings");
  });

  it("saveErrorMapSettings: PUT полным телом порогов; неверный порог — 400 с сообщением сервера", async () => {
    const fetchMock = stubFetch(200, SETTINGS);
    expect(await saveErrorMapSettings(SETTINGS)).toEqual(SETTINGS);
    const { url, method, body } = sent(fetchMock);
    expect(method).toBe("PUT");
    expect(url.pathname).toBe("/api/v1/error-map/settings");
    expect(JSON.parse(body ?? "null")).toEqual(SETTINGS);
    stubFetch(400, {
      error: { code: "badRequest", message: "Порог «часто» должен быть больше порога «иногда»" },
    });
    await expect(saveErrorMapSettings({ ...SETTINGS, oftenFrom: 0.05 })).rejects.toMatchObject({
      status: 400,
      message: "Порог «часто» должен быть больше порога «иногда»",
    });
  });
});

describe("errorMapPdfUrl: только сборка адреса, без запроса", () => {
  it("scope=group: groupId, mode и period в query; запроса не делает", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const url = new URL(
      errorMapPdfUrl({ scope: "group", groupId: "ДДС-01", mode: "dds", period: "2w" }),
      "http://localhost",
    );
    expect(url.pathname).toBe("/api/v1/error-map/export.pdf");
    expect(url.searchParams.get("scope")).toBe("group");
    expect(url.searchParams.get("groupId")).toBe("ДДС-01");
    expect(url.searchParams.has("studentId")).toBe(false);
    expect(url.searchParams.get("mode")).toBe("dds");
    expect(url.searchParams.get("period")).toBe("2w");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("scope=student: studentId кодируется query-строкой, groupId не передаётся", () => {
    const url = new URL(
      errorMapPdfUrl({ scope: "student", studentId: "u 5", mode: "operator112" }),
      "http://localhost",
    );
    expect(url.searchParams.get("scope")).toBe("student");
    expect(url.searchParams.get("studentId")).toBe("u 5");
    expect(url.searchParams.has("groupId")).toBe(false);
    expect(url.searchParams.get("mode")).toBe("operator112");
    expect(url.searchParams.has("period")).toBe(false);
  });

  it("scope=journal: groupId и period; без period ключ не появляется", () => {
    const url = new URL(errorMapPdfUrl({ scope: "journal", groupId: "ДДС-01" }), "http://localhost");
    expect(url.searchParams.get("scope")).toBe("journal");
    expect(url.searchParams.get("groupId")).toBe("ДДС-01");
    expect(url.searchParams.has("period")).toBe(false);
    expect(url.searchParams.has("mode")).toBe(false);
  });
});

describe("клиент карты ошибок: раздел только для бэкенда (T007)", () => {
  it("404 без тела (Next без BACKEND_URL) → ServerRequiredError на /me/focus", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => new Response("<html>404</html>", { status: 404 })),
    );
    const error = await caught(getMyFocus());
    expect(error).toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 404, code: "serverRequired" });
  });

  it("404 с телом { error } (бэкенд, нет группы) — обычный ApiError, не «нужен сервер»", async () => {
    stubFetch(404, { error: { code: "notFound", message: "Группа не найдена" } });
    const error = await caught(listErrorMapGroups());
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 404, code: "notFound", message: "Группа не найдена" });
  });

  it("сетевой сбой — networkError, а не «нужен сервер»", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const error = await caught(getErrorMapSettings());
    expect(error).not.toBeInstanceOf(ServerRequiredError);
    expect(error).toMatchObject({ status: 0, code: "networkError" });
  });
});

describe("errorMapXlsxUrl: адрес Excel-выгрузки", () => {
  it("те же параметры, что у PDF, другой путь; запроса не делает", () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const params = { scope: "journal", groupId: "ДДС-01", mode: "dds", period: "1m" } as const;
    const xlsx = new URL(errorMapXlsxUrl(params), "http://localhost");
    const pdf = new URL(errorMapPdfUrl(params), "http://localhost");
    expect(xlsx.pathname).toBe("/api/v1/error-map/export.xlsx");
    expect(Object.fromEntries(xlsx.searchParams)).toEqual(Object.fromEntries(pdf.searchParams));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
