import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Config from "@/shared/config";
import type { OperatorAttempt } from "@/shared/api";

const mocks = vi.hoisted(() => ({ realtime: vi.fn(), recording: vi.fn() }));
vi.mock("@/shared/config", async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, APP_ENV: { ...actual.APP_ENV, liveCallsEnabled: true } };
});
vi.mock("./useRealtimeCaller", () => ({ useRealtimeCaller: mocks.realtime }));
vi.mock("./useCallerAudio", () => ({ useCallerAudio: mocks.recording }));

import { useApplicantVoice } from "./useApplicantVoice";

const attempt = (state: OperatorAttempt["state"]): OperatorAttempt => ({
  id: "att-1",
  cardId: "c-010",
  studentId: "u-005",
  aon: "+7 (916) 126-34-71",
  incidentNumber: 4,
  createdAt: "2026-10-20T10:00:00Z",
  openedAt: "2026-10-20T10:00:00Z",
  state,
  events: [],
  replays: 0,
  hintsShown: 0,
});

function call(overrides: Record<string, unknown> = {}) {
  return {
    configured: true,
    phase: "idle",
    error: "",
    level: 0,
    muted: false,
    lastHeard: "",
    lastCaller: "",
    prepare: vi.fn().mockResolvedValue(true),
    mute: vi.fn(),
    finish: vi.fn(),
    ...overrides,
  };
}

describe("useApplicantVoice: живой заявитель (флаг включён)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.recording.mockReturnValue({ status: "idle" });
  });

  it.each(["training", "exam"] as const)("%s: разговор с ИИ, запись не запрашивается", (format) => {
    mocks.realtime.mockReturnValue(call());
    mocks.recording.mockReturnValue({ status: "idle" });
    const { result } = renderHook(() => useApplicantVoice({ attempt: attempt("answered"), format }));
    expect(result.current.kind).toBe("live");
    expect(mocks.realtime).toHaveBeenCalledWith("att-1", true);
    expect(mocks.recording).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it.each([
    [{ configured: null }, "checking"],
    [{ phase: "idle" }, "idle"],
    [{ phase: "connecting" }, "connecting"],
    [{ phase: "listening" }, "playing"],
    [{ phase: "thinking" }, "playing"],
    [{ phase: "speaking" }, "playing"],
    [{ phase: "ended" }, "ended"],
  ])("%o → %s", (overrides, state) => {
    mocks.realtime.mockReturnValue(call(overrides));
    const { result } = renderHook(() =>
      useApplicantVoice({ attempt: attempt("answered"), format: "training" }),
    );
    expect(result.current.state).toBe(state);
  });

  it("start() готовит гарнитуру, stop() завершает разговор, mute() — микрофон", async () => {
    const current = call({ phase: "listening", level: 0.4 });
    mocks.realtime.mockReturnValue(current);
    const { result } = renderHook(() =>
      useApplicantVoice({ attempt: attempt("ringing"), format: "training" }),
    );
    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
    expect(current.prepare).toHaveBeenCalledOnce();
    act(() => result.current.mute());
    expect(current.mute).toHaveBeenCalledOnce();
    act(() => result.current.stop());
    expect(current.finish).toHaveBeenCalledOnce();
    expect(result.current.level).toBe(0.4);
  });

  it("реплики отдаются только как текст для полосы тренажёра, ошибка — наружу", () => {
    mocks.realtime.mockReturnValue(
      call({ phase: "listening", error: "Нет микрофона", lastHeard: "алло", lastCaller: "Пожар!" }),
    );
    const { result } = renderHook(() =>
      useApplicantVoice({ attempt: attempt("answered"), format: "training" }),
    );
    expect(result.current.trainerText).toEqual({ heard: "алло", caller: "Пожар!", emergency: "" });
    expect(result.current.error).toBe("Нет микрофона");
    expect(result.current.recordingUrl).toBeNull();
  });

  it.each([{ configured: false }, { phase: "error", error: "Нет микрофона" }])("%o → запись", (o) => {
    mocks.realtime.mockReturnValue(call(o));
    const { result } = renderHook(() =>
      useApplicantVoice({ attempt: attempt("answered"), format: "training" }),
    );
    expect(result.current.kind).toBe("recording");
  });

  it("unavailable → запись билета, загрузка включена; живой работает — запись выключена", () => {
    mocks.realtime.mockReturnValue(call({ phase: "error", error: "Нет микрофона" }));
    mocks.recording.mockReturnValue({ status: "ready", url: "blob:rec" });
    const { result } = renderHook(() =>
      useApplicantVoice({ attempt: attempt("answered"), format: "training" }),
    );
    expect(mocks.recording).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
    expect(result.current.kind).toBe("recording");
    expect(result.current.state).toBe("playing");
    expect(result.current.recordingUrl).toBe("blob:rec");
    expect(result.current.trainerText.emergency).toContain("недоступен");
  });
});
