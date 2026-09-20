import { afterEach, describe, expect, it, vi } from "vitest";

async function loadEnv() {
  vi.resetModules();
  return (await import("./env")).APP_ENV;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("APP_ENV — флаги экрана входа", () => {
  it("2FA и демо-режим включены по умолчанию", async () => {
    vi.stubEnv("NEXT_PUBLIC_TWO_FACTOR", undefined);
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", undefined);
    const env = await loadEnv();
    expect(env.isTwoFactorEnabled).toBe(true);
    expect(env.isDemoMode).toBe(true);
  });

  it("NEXT_PUBLIC_TWO_FACTOR=false выключает шаг 2FA, NEXT_PUBLIC_DEMO_MODE=false — подсказки", async () => {
    vi.stubEnv("NEXT_PUBLIC_TWO_FACTOR", "false");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "false");
    const env = await loadEnv();
    expect(env.isTwoFactorEnabled).toBe(false);
    expect(env.isDemoMode).toBe(false);
  });
});
