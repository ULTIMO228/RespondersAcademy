import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as Config from "@/shared/config";
import type { OperatorAttempt } from "@/shared/api";

const mocks = vi.hoisted(() => ({ realtime: vi.fn(), recording: vi.fn() }));
vi.mock("@/shared/config", async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, APP_ENV: { ...actual.APP_ENV, liveCallsEnabled: false } };
});
vi.mock("./useRealtimeCaller", () => ({ useRealtimeCaller: mocks.realtime }));
vi.mock("./useCallerAudio", () => ({ useCallerAudio: mocks.recording }));

import { useApplicantVoice } from "./useApplicantVoice";

const attempt: OperatorAttempt = {
  id: "att-1",
  cardId: "c-010",
  studentId: "u-005",
  aon: "+7 (916) 126-34-71",
  incidentNumber: 4,
  createdAt: "2026-10-20T10:00:00Z",
  openedAt: "2026-10-20T10:00:00Z",
  state: "answered",
  events: [],
  replays: 0,
  hintsShown: 0,
  audio: {
    cardId: "c-010",
    status: "failed",
    transcript: "Горит квартира",
    voice: "female",
    emergency: true,
  },
};

describe("useApplicantVoice: запись (флаг выключен)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("живой разговор не подключается, запись грузится тем же загрузчиком", () => {
    const loader = vi.fn();
    mocks.recording.mockReturnValue({ status: "idle" });
    const { result } = renderHook(() => useApplicantVoice({ attempt, format: "exam", loader }));
    expect(result.current.kind).toBe("recording");
    expect(mocks.realtime).not.toHaveBeenCalled();
    expect(mocks.recording).toHaveBeenCalledWith({ attempt, format: "exam", loader });
  });

  it.each([
    [{ status: "idle" }, "idle", null],
    [{ status: "loading" }, "connecting", null],
    [{ status: "ready", url: "blob:1" }, "playing", "blob:1"],
    [{ status: "denied" }, "ended", null],
  ])("%o → %s", (audio, state, url) => {
    mocks.recording.mockReturnValue(audio);
    const { result } = renderHook(() => useApplicantVoice({ attempt, format: "training" }));
    expect(result.current.state).toBe(state);
    expect(result.current.recordingUrl).toBe(url);
    expect(result.current.trainerText.emergency).toBe("");
  });

  it("аварийный режим: unavailable, расшифровка — только для полосы тренажёра", async () => {
    mocks.recording.mockReturnValue({ status: "emergency" });
    const { result } = renderHook(() => useApplicantVoice({ attempt, format: "training" }));
    expect(result.current.state).toBe("unavailable");
    expect(result.current.trainerText).toEqual({ heard: "", caller: "", emergency: "Горит квартира" });
    await act(async () => {
      expect(await result.current.start()).toBe(true);
    });
  });
});
