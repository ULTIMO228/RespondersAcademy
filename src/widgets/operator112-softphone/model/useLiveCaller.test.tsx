import { StrictMode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { LiveCallRecord } from "@/shared/api";
import type { VoiceCaptureOptions } from "@/shared/lib/live-call";

import { useLiveCaller } from "./useLiveCaller";

function setup() {
  let voice!: VoiceCaptureOptions;
  const initial: LiveCallRecord = {
    status: "active",
    transcript: [{ speaker: "caller", text: "Помогите", at: "now", turnId: "intro" }],
  };
  const capture = { start: vi.fn().mockResolvedValue(undefined), setEnabled: vi.fn(), stop: vi.fn() };
  const deps = {
    capture: vi.fn((options: VoiceCaptureOptions) => {
      voice = options;
      return capture;
    }),
    api: {
      start: vi.fn().mockResolvedValue(initial),
      read: vi.fn().mockResolvedValue(initial),
      turn: vi
        .fn()
        .mockResolvedValue({
          ...initial,
          transcript: [
            ...initial.transcript,
            { speaker: "caller", text: "На улице Грина", at: "now", turnId: "reply" },
          ],
        }),
      audio: vi.fn().mockResolvedValue(new Blob(["audio"])),
      finish: vi.fn().mockResolvedValue({ ...initial, status: "ended" }),
    },
  };
  const utterance = () => {
    voice.onSpeechStart();
    voice.onSpeechEnd();
    voice.onUtterance(new Blob(["wav"]));
  };
  return { initial, capture, deps, utterance, voice: () => voice };
}

describe("useLiveCaller: разговор без кнопки отправки", () => {
  it("StrictMode создаёт один звонок, микрофон подключается один раз и отправляет несколько фраз", async () => {
    const test = setup();
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    expect(test.deps.api.start).toHaveBeenCalledTimes(1);
    expect(test.deps.api.audio).toHaveBeenCalledTimes(1);
    expect(test.deps.api.finish).not.toHaveBeenCalled();
    await act(() => result.current.connectMicrophone());
    await act(async () => test.utterance());
    await waitFor(() => expect(test.deps.api.turn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    await act(async () => test.utterance());
    await waitFor(() => expect(test.deps.api.turn).toHaveBeenCalledTimes(2));
    expect(test.deps.capture).toHaveBeenCalledTimes(1);
    expect(test.capture.start).toHaveBeenCalledTimes(1);
    await act(() => result.current.finish());
    expect(test.capture.stop).toHaveBeenCalled();
    expect(result.current.phase).toBe("ended");
    expect(result.current.audio).toBeNull();
  });

  it("начало речи прерывает звук, а поздний ответ не начинает говорить поверх человека", async () => {
    const test = setup();
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.audio).not.toBeNull());
    await act(() => result.current.connectMicrophone());
    let resolve!: (value: LiveCallRecord) => void;
    test.deps.api.turn.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => test.utterance());
    act(() => test.voice().onSpeechStart());
    expect(result.current.audio).toBeNull();
    await act(async () => resolve(test.initial));
    expect(test.deps.api.audio).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe("speaking");
    expect(result.current.audio).toBeNull();
  });

  it("вопрос, заданный во время обработки, сохраняется в очереди", async () => {
    const test = setup();
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    await act(() => result.current.connectMicrophone());
    let resolve!: (value: LiveCallRecord) => void;
    test.deps.api.turn.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await act(async () => test.utterance());
    await act(async () => test.utterance());
    expect(test.deps.api.turn).toHaveBeenCalledTimes(1);
    await act(async () => resolve(test.initial));
    await waitFor(() => expect(test.deps.api.turn).toHaveBeenCalledTimes(2));
  });

  it("повтор после сетевого сбоя сохраняет UUID и WAV, выключая микрофон на время ошибки", async () => {
    const test = setup();
    test.deps.api.turn.mockRejectedValueOnce(new Error("Сеть недоступна"));
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    await act(() => result.current.connectMicrophone());
    await act(async () => test.utterance());
    expect(result.current.error).toBe("Сеть недоступна");
    expect(result.current.muted).toBe(true);
    await act(() => result.current.retry());
    expect(test.deps.api.turn.mock.calls[0]).toEqual(test.deps.api.turn.mock.calls[1]);
    expect(result.current.error).toBeNull();
  });

  it("неразобранная фраза не повторяется бесконечно и не блокирует следующую", async () => {
    const test = setup();
    test.deps.api.turn.mockRejectedValueOnce(new ApiError(400, "validationFailed", "Речь не распознана"));
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    await act(() => result.current.connectMicrophone());
    await act(async () => test.utterance());
    expect(result.current.canRetry).toBe(false);
    expect(result.current.muted).toBe(false);
    await act(async () => test.utterance());
    expect(test.deps.api.turn).toHaveBeenCalledTimes(2);
  });

  it("mute прекращает захват фраз, повторное включение не создаёт второй микрофон", async () => {
    const test = setup();
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    await act(() => result.current.connectMicrophone());
    act(() => result.current.toggleMicrophone());
    await act(async () => test.utterance());
    expect(test.deps.api.turn).not.toHaveBeenCalled();
    expect(test.capture.setEnabled).toHaveBeenLastCalledWith(false);
    await act(() => result.current.connectMicrophone());
    expect(test.deps.capture).toHaveBeenCalledTimes(1);
  });

  it("уход во время старта закрывает поздний звонок", async () => {
    const test = setup();
    let resolve!: (value: LiveCallRecord) => void;
    test.deps.api.start.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const { unmount } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    unmount();
    await act(async () => resolve(test.initial));
    await waitFor(() => expect(test.deps.api.finish).toHaveBeenCalledWith("att-1"));
    expect(test.deps.api.audio).not.toHaveBeenCalled();
  });

  it("завершение во время разрешения микрофона останавливает поздний захват", async () => {
    const test = setup();
    let resolve!: () => void;
    test.capture.start.mockReturnValueOnce(
      new Promise<void>((done) => {
        resolve = done;
      }),
    );
    const { result } = renderHook(() => useLiveCaller("att-1", true, test.deps));
    await waitFor(() => expect(result.current.phase).toBe("playing"));
    let connecting!: Promise<boolean>;
    act(() => {
      connecting = result.current.connectMicrophone();
    });
    await act(() => result.current.finish());
    await act(async () => {
      resolve();
      expect(await connecting).toBe(false);
    });
    expect(test.capture.stop).toHaveBeenCalled();
    expect(result.current.connected).toBe(false);
    expect(result.current.phase).toBe("ended");
  });
});
