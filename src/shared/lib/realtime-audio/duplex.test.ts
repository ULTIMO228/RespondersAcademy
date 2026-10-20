import { afterEach, describe, expect, it, vi } from "vitest";
import { createDuplex } from "./duplex";

function setup() {
  const track = { enabled: true, stop: vi.fn(), onended: null as (() => void) | null };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const media = vi.fn().mockResolvedValue(stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: media } });
  const node = { connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    state: "running",
    sampleRate: 16000,
    destination: {},
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    createMediaStreamSource: () => node,
    createGain: () => ({ ...node, gain: { value: 1 } }),
  };
  const processor = {
    ...node,
    port: { onmessage: null as ((event: MessageEvent<Float32Array>) => void) | null },
    onprocessorerror: null,
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      constructor() {
        return processor;
      }
    },
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:local");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const options = { onAudio: vi.fn(), onLevel: vi.fn(), onError: vi.fn() };
  const duplex = createDuplex(options);
  const feed = (sample: number) =>
    processor.port.onmessage?.({ data: new Float32Array(320).fill(sample) } as MessageEvent<Float32Array>);
  return { track, stream, media, context, processor, options, duplex, feed };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Непрерывный PCM микрофона", () => {
  it("отправляет речь и тишину сразу, без WAV и ожидания окончания фразы", async () => {
    const t = setup();
    await t.duplex.prepare();
    t.feed(0.1);
    expect(t.options.onAudio).not.toHaveBeenCalled();
    t.duplex.transmit();
    t.feed(0.1);
    t.feed(0);
    expect(t.media).toHaveBeenCalledOnce();
    expect(t.options.onAudio).toHaveBeenCalledTimes(2);
    const speech = atob(t.options.onAudio.mock.calls[0][0] as string);
    expect(speech).toHaveLength(640);
    expect(speech.slice(0, 4)).not.toBe("RIFF");
    expect(atob(t.options.onAudio.mock.calls[1][0] as string)).toBe("\0".repeat(640));
    t.duplex.mute(true);
    t.feed(0.5);
    expect(t.track.enabled).toBe(false);
    expect(atob(t.options.onAudio.mock.calls[2][0] as string)).toBe("\0".repeat(640));
    t.duplex.stop();
    expect(t.track.stop).toHaveBeenCalledOnce();
    expect(t.processor.port.onmessage).toBeNull();
  });
  it("закрывает контекст при отказе разрешения", async () => {
    const t = setup();
    t.media.mockRejectedValueOnce(Object.assign(new Error(), { name: "NotAllowedError" }));
    await expect(t.duplex.prepare()).rejects.toThrow("Разрешите доступ");
    expect(t.context.close).toHaveBeenCalled();
  });
  it("освобождает устройство, если доступ получен после ухода", async () => {
    const t = setup();
    let resume!: (stream: MediaStream) => void;
    t.media.mockReturnValue(
      new Promise((resolve) => {
        resume = resolve;
      }),
    );
    const pending = t.duplex.prepare();
    t.duplex.stop();
    resume(t.stream);
    await pending;
    expect(t.track.stop).toHaveBeenCalledOnce();
    expect(t.context.audioWorklet.addModule).not.toHaveBeenCalled();
  });
});
