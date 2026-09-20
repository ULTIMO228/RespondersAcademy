import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "@/entities/user";
import { ApiError } from "@/shared/api";

import type { ProgressApi } from "../api/progressApi";
import { useStudentProgress } from "./useStudentProgress";

function signIn(userId: string) {
  sessionStore.set({
    userId,
    role: "student",
    token: `mock-${userId}`,
    twoFactorUsed: true,
    issuedAt: new Date().toISOString(),
  });
}

function createApi(overrides: Partial<ProgressApi> = {}): ProgressApi {
  return {
    getStudentReports: vi.fn(async () => ({ reports: [], groupReport: null })),
    listSessions: vi.fn(async () => []),
    getAttemptEvaluation: vi.fn(),
    getCard: vi.fn(),
    listScenarios: vi.fn(async () => []),
    ...overrides,
  };
}

afterEach(() => {
  sessionStore.clear();
});

describe("useStudentProgress", () => {
  it("подставляет studentId пользователя сессии в запросы мок-API", async () => {
    signIn("u-006");
    const api = createApi();
    const { result } = renderHook(() => useStudentProgress(api));
    expect(result.current.state.status).toBe("loading");
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(api.getStudentReports).toHaveBeenCalledWith("u-006", expect.any(AbortSignal));
    expect(api.listSessions).toHaveBeenCalledWith({ studentId: "u-006" }, expect.any(AbortSignal));
  });

  it("без сессии запросов нет — состояние noSession", () => {
    const api = createApi();
    const { result } = renderHook(() => useStudentProgress(api));
    expect(result.current.state.status).toBe("noSession");
    expect(api.getStudentReports).not.toHaveBeenCalled();
  });

  it("сеть недоступна → error/offline; «Повторить» перезапрашивает", async () => {
    signIn("u-005");
    const offline = new ApiError(0, "networkError", "Нет соединения с сервером");
    const getStudentReports = vi
      .fn<ProgressApi["getStudentReports"]>()
      .mockRejectedValueOnce(offline)
      .mockResolvedValue({ reports: [], groupReport: null });
    const api = createApi({ getStudentReports });
    const { result } = renderHook(() => useStudentProgress(api));
    await waitFor(() => expect(result.current.state).toMatchObject({ status: "error", isOffline: true }));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    expect(getStudentReports).toHaveBeenCalledTimes(2);
  });
});
