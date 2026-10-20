import { afterEach, describe, expect, it, vi } from "vitest";

import { ServerRequiredError } from "./client";
import { getAiHealth, getAiSettings, putAiSettings, testAiConnection } from "./ai-settings";

function stubFetch(status: number, payload: unknown) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(payload === undefined ? null : JSON.stringify(payload), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("клиент настройки ИИ", () => {
  it("читает настройку по GET /api/v1/admin/ai/settings", async () => {
    const fetchMock = stubFetch(200, { source: "local" });
    await expect(getAiSettings()).resolves.toEqual({ source: "local" });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/admin/ai/settings");
  });

  it("сохраняет источник и ключ через PUT с JSON-телом", async () => {
    const fetchMock = stubFetch(200, { source: "cloud" });
    await putAiSettings({ source: "cloud", apiKey: "k" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("/api/v1/admin/ai/settings");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(init?.body as string)).toEqual({ source: "cloud", apiKey: "k" });
  });

  it("проверяет подключение через POST /settings/test", async () => {
    const fetchMock = stubFetch(200, { ok: true, latencyMs: 120, route: "cerebras/fp16" });
    await expect(testAiConnection({ source: "cloud" })).resolves.toMatchObject({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/v1/admin/ai/settings/test");
    expect(fetchMock.mock.calls[0][1]?.method).toBe("POST");
  });

  it("без бэкенда (404 без тела ошибки) — ServerRequiredError", async () => {
    stubFetch(404, undefined);
    await expect(getAiHealth()).rejects.toBeInstanceOf(ServerRequiredError);
  });
});
