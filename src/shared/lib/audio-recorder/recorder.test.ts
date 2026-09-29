import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RECORDER_MESSAGES, RecorderError, createAudioRecorder } from "./recorder";

class FakeMediaRecorder {
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["chunk"]) });
    this.onstop?.();
  }
}

const track = { stop: vi.fn() };
const stream = { getTracks: () => [track] } as unknown as MediaStream;

function deps(overrides: Record<string, unknown> = {}) {
  return {
    getUserMedia: vi.fn().mockResolvedValue(stream),
    createMediaRecorder: () => new FakeMediaRecorder() as unknown as MediaRecorder,
    decodeAudio: vi.fn().mockResolvedValue({ sampleRate: 48_000, channels: [new Float32Array(48_000)] }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  track.stop.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("createAudioRecorder", () => {
  it("запись → стоп: WAV 16 кГц, микрофон освобождён", async () => {
    const recorder = createAudioRecorder({ deps: deps() });
    await recorder.start();
    const wav = await recorder.stop();
    const view = new DataView(await wav.arrayBuffer());
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(track.stop).toHaveBeenCalled();
  });

  it("отказ доступа к микрофону → RecorderError denied с русским сообщением", async () => {
    const recorder = createAudioRecorder({
      deps: deps({
        getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotAllowedError" })),
      }),
    });
    await expect(recorder.start()).rejects.toMatchObject({
      code: "denied",
      message: RECORDER_MESSAGES.denied,
    });
  });

  it("нет устройства/поддержки → unsupported", async () => {
    const recorder = createAudioRecorder({
      deps: deps({
        getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("x"), { name: "NotFoundError" })),
      }),
    });
    await expect(recorder.start()).rejects.toMatchObject({ code: "unsupported" });
  });

  it("сбой декодирования → failed", async () => {
    const recorder = createAudioRecorder({
      deps: deps({ decodeAudio: vi.fn().mockRejectedValue(new Error("bad")) }),
    });
    await recorder.start();
    await expect(recorder.stop()).rejects.toBeInstanceOf(RecorderError);
  });

  it("через 180 с запись останавливается сама и сообщает об этом", async () => {
    const onAutoStop = vi.fn();
    const recorder = createAudioRecorder({ onAutoStop, deps: deps() });
    await recorder.start();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(onAutoStop).toHaveBeenCalledTimes(1);
    expect((await recorder.stop()).size).toBeGreaterThan(44);
  });

  it("stop без start и cancel: ошибка и освобождение микрофона", async () => {
    const recorder = createAudioRecorder({ deps: deps() });
    await expect(recorder.stop()).rejects.toMatchObject({ code: "failed" });
    await recorder.start();
    recorder.cancel();
    expect(track.stop).toHaveBeenCalled();
  });
});
