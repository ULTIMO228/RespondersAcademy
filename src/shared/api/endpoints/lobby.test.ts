import { afterEach, describe, expect, it, vi } from "vitest";

import { getKbArticle, listKbArticles } from "./kb";
import { acceptRecommendation, getAnalytics, getHistory, getMe, listRecommendations } from "./lobby";

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(payload, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof stubFetch>) {
  const [input, init] = fetchMock.mock.calls[0];
  return { url: new URL(String(input), "http://localhost"), method: init?.method ?? "GET" };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("клиент лобби /api/v1/me/*", () => {
  it("getMe и getAnalytics — GET на свои пути", async () => {
    const meFetch = stubFetch(200, { id: "u-005" });
    await getMe();
    expect(sent(meFetch).url.pathname).toBe("/api/v1/me");
    const analyticsFetch = stubFetch(200, { byMode: {} });
    await getAnalytics();
    expect(sent(analyticsFetch).url.pathname).toBe("/api/v1/me/analytics");
  });

  it("getHistory: фильтры режим/формат и страница уходят query-параметрами", async () => {
    const fetchMock = stubFetch(200, { items: [], total: 0, page: 2, perPage: 5 });
    await getHistory({ mode: "operator112", format: "exam", page: 2, perPage: 5 });
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/me/history");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "operator112",
      format: "exam",
      page: "2",
      perPage: "5",
    });
  });

  it("listRecommendations: limit в query; 403 не-обучающегося — ApiError", async () => {
    const fetchMock = stubFetch(200, []);
    await listRecommendations(5);
    expect(sent(fetchMock).url.searchParams.get("limit")).toBe("5");
    stubFetch(403, { error: { code: "forbidden", message: "Доступно роли student" } });
    await expect(listRecommendations()).rejects.toMatchObject({ status: 403, code: "forbidden" });
  });

  it("acceptRecommendation: POST /accept, id кодируется", async () => {
    const fetchMock = stubFetch(200, { id: "rec-1", acceptedAt: "2026-09-29T10:00:00+03:00" });
    const result = await acceptRecommendation("rec-1");
    expect(result.acceptedAt).toBeDefined();
    const { url, method } = sent(fetchMock);
    expect(method).toBe("POST");
    expect(url.pathname).toBe("/api/v1/me/recommendations/rec-1/accept");
  });
});

describe("клиент справочника /api/v1/kb", () => {
  it("listKbArticles: group и q в query (кириллица кодируется)", async () => {
    const fetchMock = stubFetch(200, []);
    await listKbArticles({ group: "пожар", q: "балкон" });
    const { url } = sent(fetchMock);
    expect(url.pathname).toBe("/api/v1/kb/articles");
    expect(url.searchParams.get("group")).toBe("пожар");
    expect(url.searchParams.get("q")).toBe("балкон");
  });

  it("getKbArticle: 404 бэкенда по данным остаётся обычным ApiError", async () => {
    const fetchMock = stubFetch(404, { error: { code: "notFound", message: "Статья не найдена" } });
    await expect(getKbArticle("kb-9")).rejects.toMatchObject({ status: 404, code: "notFound" });
    expect(sent(fetchMock).url.pathname).toBe("/api/v1/kb/articles/kb-9");
  });
});
