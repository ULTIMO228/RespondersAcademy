import { afterEach, describe, expect, it, vi } from "vitest";

import { getGroupInsights, getStudentProfile } from "./lobby";
import { updateKbArticle } from "./kb";
import { downloadReportExport } from "./reports";
import { listTickets } from "./tickets";

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
    body: init?.body as string,
  };
}

const SECTIONS = { signs: ["a"], notification: [], clarify: [], ddsDecision: [], typicalErrors: [] };

afterEach(() => vi.unstubAllGlobals());

describe("клиенты преподавателя /api/v1", () => {
  it("getStudentProfile: GET /teacher/students/{id}/profile, id кодируется; 403 — ApiError", async () => {
    const profile = {
      ratings: { dds: 1000, operator112: 1010 },
      strongerMode: null,
      typicalErrors: { dds: [], operator112: [] },
      recommendations: [],
    };
    const fetchMock = stubFetch(200, profile);
    expect(await getStudentProfile("u 5")).toEqual(profile);
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/teacher/students/u%205/profile");
    stubFetch(403, { error: { code: "forbidden", message: "Недостаточно прав" } });
    await expect(getStudentProfile("u-5")).rejects.toMatchObject({ status: 403 });
  });

  it("getGroupInsights: assignmentId уходит в query, без него — не уходит", async () => {
    const fetchMock = stubFetch(200, { insights: [], suggestedGroup: null });
    await getGroupInsights("ДДС-1", "asg-001");
    expect(sent(fetchMock).url.searchParams.get("assignmentId")).toBe("asg-001");
    expect(decodeURIComponent(sent(fetchMock).url.pathname)).toBe("/api/v1/teacher/groups/ДДС-1/insights");
    const second = stubFetch(200, { insights: [], suggestedGroup: null });
    await getGroupInsights("ДДС-1");
    expect(sent(second).url.searchParams.has("assignmentId")).toBe(false);
  });

  it("updateKbArticle: PATCH с телом { sections } и только им; 403 обучающегося", async () => {
    const fetchMock = stubFetch(200, { id: "kb-1", group: "g", title: "t", sections: SECTIONS });
    await updateKbArticle("kb-1", SECTIONS);
    const { method, body, url } = sent(fetchMock);
    expect(method).toBe("PATCH");
    expect(url.pathname).toBe("/api/v1/kb/articles/kb-1");
    expect(JSON.parse(body)).toEqual({ sections: SECTIONS });
    stubFetch(403, { error: { code: "forbidden", message: "Недостаточно прав" } });
    await expect(updateKbArticle("kb-1", SECTIONS)).rejects.toMatchObject({ status: 403 });
  });

  it("listTickets: массивы group и difficulty — повторные ключи", async () => {
    const fetchMock = stubFetch(200, []);
    await listTickets({ group: ["Пожар", "ДТП"], difficulty: [1, 2], validationStatus: "approved" });
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/tickets");
    expect(url.searchParams.getAll("group")).toEqual(["Пожар", "ДТП"]);
    expect(url.searchParams.getAll("difficulty")).toEqual(["1", "2"]);
    expect(url.searchParams.get("validationStatus")).toBe("approved");
  });

  it("downloadReportExport: GET export.csv|pdf возвращает Blob; 403 и 404 — ApiError", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("bom,csv", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const blob = await downloadReportExport("rep-001", "csv");
    expect(blob).toBeInstanceOf(Blob);
    expect(await blob.text()).toBe("bom,csv");
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/reports/rep-001/export.csv");
    stubFetch(403, {
      error: { code: "forbidden", message: "Отчёты занятия другого преподавателя недоступны" },
    });
    await expect(downloadReportExport("rep-001", "pdf")).rejects.toMatchObject({ status: 403 });
    stubFetch(404, { error: { code: "notFound", message: "Отчёт не найден" } });
    await expect(downloadReportExport("x", "pdf")).rejects.toMatchObject({
      status: 404,
      message: "Отчёт не найден",
    });
  });
});
