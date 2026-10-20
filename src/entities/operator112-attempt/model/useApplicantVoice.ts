"use client";

import { APP_ENV } from "@/shared/config";
import type { AssignmentFormat, OperatorAttempt } from "@/shared/api";

import { useCallerAudio } from "./useCallerAudio";
import type { CallerAudioLoader } from "./useCallerAudio";
import { useRealtimeCaller } from "./useRealtimeCaller";

/**
 * checking — проверяем голосовой сервер; idle — разговор не начат; connecting — гарнитура/запись готовятся; playing — заявитель
 * на линии (живой разговор или звучит запись); unavailable — голоса нет (сервер не настроен, ошибка, аварийный режим записи);
 * ended — разговор завершён (в экзамене запись уже прослушана).
 */
export type ApplicantVoiceState = "checking" | "idle" | "connecting" | "playing" | "unavailable" | "ended";

export type ApplicantVoice = {
  /** live — живой ИИ-заявитель (005-live-caller); recording — TTS-запись билета. Выбирается флагом сборки, не на лету. */
  kind: "live" | "recording";
  state: ApplicantVoiceState;
  error: string;
  /** Живой: подготовить гарнитуру (до «Принять»); запись грузится сама после ответа. false — гарнитура не готова. */
  start: () => Promise<boolean>;
  stop: () => void;
  mute: () => void;
  muted: boolean;
  level: number;
  /** Запись: blob-URL для проигрывателя «записи звонков»; у живого разговора — null. */
  recordingUrl: string | null;
  /** Только для полосы тренажёра (FR-002); на экран АРМ текст реплик не выводится (FR-027). */
  trainerText: { heard: string; caller: string; emergency: string };
};

type Options = {
  attempt: OperatorAttempt;
  format: AssignmentFormat | null;
  loader?: CallerAudioLoader;
  /** Только для записи: false — не загружать (пока работает живой заявитель). */
  enabled?: boolean;
};

const TALKING = new Set(["listening", "thinking", "speaking"]);
const noop = () => {};

function useLiveVoice({ attempt }: Options): ApplicantVoice {
  const call = useRealtimeCaller(attempt.id, attempt.state === "answered");
  const state: ApplicantVoiceState =
    call.configured === null
      ? "checking"
      : !call.configured || call.phase === "error"
        ? "unavailable"
        : TALKING.has(call.phase)
          ? "playing"
          : call.phase === "connecting" || call.phase === "ended"
            ? call.phase
            : "idle";
  return {
    kind: "live",
    state,
    error: call.error,
    start: call.prepare,
    stop: call.finish,
    mute: call.mute,
    muted: call.muted,
    level: call.level,
    recordingUrl: null,
    trainerText: { heard: call.lastHeard, caller: call.lastCaller, emergency: "" },
  };
}

function useRecordedVoice(options: Options): ApplicantVoice {
  const audio = useCallerAudio(options);
  const state: ApplicantVoiceState = {
    idle: "idle",
    loading: "connecting",
    ready: "playing",
    emergency: "unavailable",
    denied: "ended",
  }[audio.status] as ApplicantVoiceState;
  return {
    kind: "recording",
    state,
    error: "",
    start: () => Promise.resolve(true),
    stop: noop,
    mute: noop,
    muted: false,
    level: 0,
    recordingUrl: audio.status === "ready" ? audio.url : null,
    trainerText: {
      heard: "",
      caller: "",
      emergency: audio.status === "emergency" ? (options.attempt.audio?.transcript ?? "") : "",
    },
  };
}

function useLiveWithRecordingFallback(options: Options): ApplicantVoice {
  const live = useLiveVoice(options);
  const unavailable = live.state === "unavailable";
  // Хуки вызываются безусловно; запись не грузится, пока живой заявитель работает.
  const recorded = useRecordedVoice({ ...options, enabled: unavailable });
  if (!unavailable) return live;
  return {
    ...recorded,
    trainerText: {
      ...recorded.trainerText,
      emergency: recorded.trainerText.emergency || "ИИ-заявитель недоступен, играет запись билета.",
    },
  };
}

/**
 * Голос заявителя в АРМ-112 (спека 009, R6/T020). Решение владельца 2026-10-20: живой ИИ-заявитель и в тренировке, и в
 * экзамене; запись — при выключенном NEXT_PUBLIC_LIVE_CALLS_ENABLED. Решение владельца 2026-10-20 (вечер): при недоступности
 * ИИ (состояние unavailable: сервер не настроен, ошибка) подменяем запись билета; пока живой работает, запись не грузится.
 */
export const useApplicantVoice: (options: Options) => ApplicantVoice = APP_ENV.liveCallsEnabled
  ? useLiveWithRecordingFallback
  : useRecordedVoice;
