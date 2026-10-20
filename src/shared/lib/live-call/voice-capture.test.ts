import { afterEach, describe, expect, it, vi } from "vitest";

import { createVoiceCapture } from "./voice-capture";

function setup() {
  const track = { enabled: true, onended: null as (() => void) | null, stop: vi.fn() };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const media = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } });
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    state: "running",
    sampleRate: 16000,
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: () => node,
    createGain: () => ({ ...node, gain: { value: 1 } }),
    destination: {},
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  const processor = {
    ...node,
    port: { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null },
    onprocessorerror: null as (() => void) | null,
  };
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      constructor() {
        return processor;
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:processor");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const options = {
    onSpeechStart: vi.fn(),
    onSpeechEnd: vi.fn(),
    onUtterance: vi.fn(),
    onLevel: vi.fn(),
    onError: vi.fn(),
  };
  const capture = createVoiceCapture(options);
  const feed = (ms: number, level: number) => {
    for (let i = 0; i < ms / 20; i++)
      processor.port.onmessage?.({ data: new Float32Array(320).fill(level) } as MessageEvent<Float32Array>);
  };
  return { track, stream, media, context, processor, options, capture, feed };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("непрерывный захват гарнитуры", () => {
  it("захватывает устройство один раз, выделяет несколько фраз в PCM WAV, тишину не отправляет", async () => {
    const test = setup();
    await test.capture.start();
    test.capture.setEnabled(true);
    test.feed(1000, 0);
    test.feed(500, 0.1);
    test.feed(1000, 0);
    test.feed(500, 0.1);
    test.feed(1000, 0);
    expect(test.media).toHaveBeenCalledTimes(1);
    expect(test.media.mock.calls[0][0].audio.echoCancellation).toBe(true);
    expect(test.options.onUtterance).toHaveBeenCalledTimes(2);
    const wav = test.options.onUtterance.mock.calls[0][0] as Blob;
    expect(new DataView(await wav.arrayBuffer()).getUint32(24, true)).toBe(16000);
    test.capture.stop();
    expect(test.track.stop).toHaveBeenCalledTimes(1);
    expect(test.context.close).toHaveBeenCalled();
    expect(test.processor.port.onmessage).toBeNull();
  });

  it("выключение микрофона сбрасывает начатую фразу и отключает дорожку", async () => {
    const test = setup();
    await test.capture.start();
    test.capture.setEnabled(true);
    test.feed(500, 0.1);
    test.capture.setEnabled(false);
    test.feed(1000, 0);
    expect(test.track.enabled).toBe(false);
    expect(test.options.onUtterance).not.toHaveBeenCalled();
    test.capture.stop();
  });

  it("отказ разрешения закрывает AudioContext и даёт понятную ошибку", async () => {
    const test = setup();
    test.media.mockRejectedValueOnce(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    await expect(test.capture.start()).rejects.toThrow("Разрешите доступ");
    expect(test.context.close).toHaveBeenCalled();
  });

  it("при уходе во время разрешения останавливает поздно полученный stream", async () => {
    const test = setup();
    let resolve!: (stream: MediaStream) => void;
    test.media.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const starting = test.capture.start();
    test.capture.stop();
    resolve(test.stream);
    await starting;
    expect(test.track.stop).toHaveBeenCalled();
    expect(test.context.audioWorklet.addModule).not.toHaveBeenCalled();
  });
});
