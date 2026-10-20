import { toReportWav } from "../audio-recorder";

import { createVoiceActivity } from "./voice-activity";

export type VoiceCaptureOptions = {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onUtterance: (wav: Blob) => void;
  onLevel: (level: number) => void;
  onError: (error: Error) => void;
};
export interface VoiceCapture {
  start(): Promise<void>;
  setEnabled(enabled: boolean): void;
  stop(): void;
}

// Локальный модуль worklet; никакого внешнего URL или библиотеки детекции.
const PROCESSOR = `
class CallerMicrophone extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = new Float32Array(2048); this.offset = 0; }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.buffer[this.offset++] = value;
      if (this.offset === this.buffer.length) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(2048); this.offset = 0;
      }
    }
    return true;
  }
}
registerProcessor('caller-microphone', CallerMicrophone);
`;

export function createVoiceCapture(options: VoiceCaptureOptions): VoiceCapture {
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let processor: AudioWorkletNode | null = null;
  let gain: GainNode | null = null;
  let enabled = false;
  let closed = false;
  let detector: ReturnType<typeof createVoiceActivity> | null = null;
  const stop = () => {
    closed = true;
    enabled = false;
    if (processor) processor.port.onmessage = null;
    processor?.disconnect();
    source?.disconnect();
    gain?.disconnect();
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    detector?.reset();
  };
  return {
    async start() {
      if (closed) throw new Error("Микрофон уже отключён. Включите его ещё раз");
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
        throw new Error("Микрофон недоступен. Откройте тренажёр по HTTPS или localhost в Chrome/Edge");
      }
      // Создаётся непосредственно при нажатии «Ответить»: сохраняем разрешение на звук.
      context = new AudioContext();
      const resumed = context.resume();
      void resumed.catch(() => undefined);
      try {
        const captured = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (closed) {
          captured.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = captured;
        await resumed;
        if (closed) return;
        if (!context.audioWorklet)
          throw new Error("Браузер не поддерживает непрерывный захват звука. Откройте тест в Chrome/Edge");
        const moduleUrl = URL.createObjectURL(new Blob([PROCESSOR], { type: "text/javascript" }));
        try {
          await context.audioWorklet.addModule(moduleUrl);
        } finally {
          URL.revokeObjectURL(moduleUrl);
        }
        if (closed) return;
        const rate = context.sampleRate;
        detector = createVoiceActivity({
          sampleRate: rate,
          onStart: options.onSpeechStart,
          onEnd: options.onSpeechEnd,
          onUtterance: (samples) => options.onUtterance(toReportWav([samples], rate)),
        });
        source = context.createMediaStreamSource(stream);
        processor = new AudioWorkletNode(context, "caller-microphone");
        processor.onprocessorerror = () => {
          stop();
          options.onError(new Error("Захват звука прервался. Включите микрофон ещё раз"));
        };
        let levelMs = 0;
        processor.port.onmessage = (event: MessageEvent<Float32Array>) => {
          if (!enabled || closed || !detector) return;
          const rms = detector.push(event.data);
          levelMs += (event.data.length / rate) * 1000;
          if (levelMs >= 100) {
            options.onLevel(Math.min(1, rms * 8));
            levelMs = 0;
          }
        };
        gain = context.createGain();
        gain.gain.value = 0;
        source.connect(processor);
        processor.connect(gain);
        gain.connect(context.destination);
        stream.getTracks().forEach((track) => {
          track.enabled = enabled;
          track.onended = () => {
            stop();
            options.onError(new Error("Микрофон отключён или доступ отозван"));
          };
        });
      } catch (reason) {
        stop();
        const name = reason instanceof Error ? reason.name : "";
        if (name === "NotAllowedError" || name === "SecurityError")
          throw new Error("Разрешите доступ к микрофону в браузере");
        throw reason instanceof Error ? reason : new Error("Не удалось подключить микрофон");
      }
    },
    setEnabled(value) {
      enabled = value && !closed;
      if (!enabled) {
        detector?.reset();
        options.onLevel(0);
      }
      stream?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    },
    stop,
  };
}
