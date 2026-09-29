/*
 * Запись речи с микрофона (спека 002, R6): MediaRecorder → decodeAudioData → WAV моно 16 бит 16 кГц (wav.ts). Браузерные API
 * приходят через deps — в тестах подменяются; вызывающий код зависит только от интерфейса AudioRecorder.
 */
import { MAX_RECORDING_SEC, toReportWav } from "./wav";

export type RecorderErrorCode = "unsupported" | "denied" | "failed";

export class RecorderError extends Error {
  readonly code: RecorderErrorCode;
  constructor(code: RecorderErrorCode, message: string) {
    super(message);
    this.name = "RecorderError";
    this.code = code;
  }
}

export const RECORDER_MESSAGES: Record<RecorderErrorCode, string> = {
  unsupported:
    "Запись недоступна: браузер не поддерживает микрофон или страница открыта не по HTTPS/localhost",
  denied: "Доступ к микрофону запрещён. Разрешите его в браузере или продолжайте без голосового доклада",
  failed: "Не удалось записать звук",
};

export interface AudioRecorder {
  /** Начать запись; отказ доступа → RecorderError("denied"). */
  start(): Promise<void>;
  /** Остановить и вернуть WAV моно 16 бит 16 кГц. Через MAX_RECORDING_SEC запись останавливается сама (onAutoStop). */
  stop(): Promise<Blob>;
  /** Отменить запись без результата (закрытие карточки): микрофон освобождается. */
  cancel(): void;
}

type RecorderDeps = {
  getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createMediaRecorder: (stream: MediaStream) => MediaRecorder;
  decodeAudio: (data: ArrayBuffer) => Promise<{ sampleRate: number; channels: Float32Array[] }>;
  setTimeout: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
};

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined"
  );
}

function browserDeps(): RecorderDeps {
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createMediaRecorder: (stream) => new MediaRecorder(stream),
    decodeAudio: async (data) => {
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(data);
        return {
          sampleRate: decoded.sampleRate,
          channels: Array.from({ length: decoded.numberOfChannels }, (_, index) =>
            decoded.getChannelData(index),
          ),
        };
      } finally {
        void context.close();
      }
    },
    setTimeout: (callback, ms) => setTimeout(callback, ms),
    clearTimeout: (handle) => clearTimeout(handle),
  };
}

export function createAudioRecorder(
  options: { onAutoStop?: () => void; deps?: Partial<RecorderDeps> } = {},
): AudioRecorder {
  let deps: RecorderDeps | null = null;
  let recorder: MediaRecorder | null = null;
  let stream: MediaStream | null = null;
  let chunks: Blob[] = [];
  let limitTimer: ReturnType<typeof setTimeout> | null = null;
  let finished: Promise<Blob> | null = null;

  const release = () => {
    if (limitTimer !== null) deps?.clearTimeout(limitTimer);
    limitTimer = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  };

  return {
    async start() {
      if (!options.deps && !isRecordingSupported())
        throw new RecorderError("unsupported", RECORDER_MESSAGES.unsupported);
      deps = { ...browserDeps(), ...options.deps };
      try {
        stream = await deps.getUserMedia({ audio: true });
      } catch (error) {
        const name = (error as { name?: string } | null)?.name;
        throw name === "NotAllowedError" || name === "SecurityError"
          ? new RecorderError("denied", RECORDER_MESSAGES.denied)
          : new RecorderError("unsupported", RECORDER_MESSAGES.unsupported);
      }
      chunks = [];
      recorder = deps.createMediaRecorder(stream);
      const active = deps;
      finished = new Promise<Blob>((resolve, reject) => {
        recorder!.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder!.onerror = () => reject(new RecorderError("failed", RECORDER_MESSAGES.failed));
        recorder!.onstop = () => {
          release();
          void (async () => {
            try {
              const decoded = await active.decodeAudio(await new Blob(chunks).arrayBuffer());
              resolve(toReportWav(decoded.channels, decoded.sampleRate));
            } catch {
              reject(new RecorderError("failed", RECORDER_MESSAGES.failed));
            }
          })();
        };
      });
      recorder.start();
      limitTimer = deps.setTimeout(() => {
        if (recorder?.state === "recording") {
          recorder.stop();
          options.onAutoStop?.();
        }
      }, MAX_RECORDING_SEC * 1000);
    },
    async stop() {
      if (!recorder || !finished) throw new RecorderError("failed", RECORDER_MESSAGES.failed);
      if (recorder.state === "recording") recorder.stop();
      return finished;
    },
    cancel() {
      if (recorder?.state === "recording") {
        recorder.onstop = null;
        recorder.stop();
      }
      release();
      recorder = null;
      finished = null;
    },
  };
}
