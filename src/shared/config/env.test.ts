import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv() {
  vi.resetModules();
  return (await import("./env")).APP_ENV;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APP_ENV — флаги экрана входа", () => {
  it("демо-режим включён по умолчанию", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", undefined);
    const env = await loadEnv();
    expect(env.isDemoMode).toBe(true);
  });

  it("NEXT_PUBLIC_DEMO_MODE=false скрывает подсказки", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const env = await loadEnv();
    expect(env.isDemoMode).toBe(false);
  });
});

describe("SERVER_ENV — серверные переменные", () => {
  it("секрет сессии мок-слоя не задан по умолчанию (генерируется процессом)", async () => {
    vi.stubEnv("MOCK_SESSION_SECRET", undefined);
    vi.resetModules();
    expect((await import("./env")).SERVER_ENV.mockSessionSecret).toBeUndefined();
  });

  it("читает MOCK_SESSION_SECRET", async () => {
    vi.stubEnv("MOCK_SESSION_SECRET", "test-secret");
    vi.resetModules();
    expect((await import("./env")).SERVER_ENV.mockSessionSecret).toBe("test-secret");
  });
});
