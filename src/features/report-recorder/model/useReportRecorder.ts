"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, postReportAudio } from "@/shared/api";
import type { ReportAudioResponse } from "@/shared/api";
import { RecorderError, createAudioRecorder } from "@/shared/lib";
import type { AudioRecorder } from "@/shared/lib";

export const SPEECH_UNAVAILABLE_MESSAGE = "Распознавание речи недоступно";
const HTTP_UNAVAILABLE = 503;

export type ReportState =
  | { status: "idle" }
  | { status: "recording" }
  | { status: "recorded"; wav: Blob }
  | { status: "sending" }
  | { status: "done"; result: ReportAudioResponse }
  | { status: "error"; message: string; wav?: Blob };

export type ReportApi = (attemptId: string, wav: Blob) => Promise<ReportAudioResponse>;

type Options = {
  attemptId: string;
  createRecorder?: (onAutoStop: () => void) => AudioRecorder;
  send?: ReportApi;
};

function messageOf(error: unknown): string {
  if (error instanceof RecorderError) return error.message;
  if (error instanceof ApiError)
    return error.status === HTTP_UNAVAILABLE ? SPEECH_UNAVAILABLE_MESSAGE : error.message;
  return "Не удалось отправить доклад";
}

/**
 * Голосовой доклад: запись → остановка → отправка WAV на распознавание. Сбой микрофона или сервера не трогает карточку:
 * остаётся сообщение и (для отправки) запись, чтобы повторить. Параллельная отправка блокируется.
 */
export function useReportRecorder({
  attemptId,
  createRecorder,
  send = (id, wav) => postReportAudio(id, wav),
}: Options) {
  const [state, setState] = useState<ReportState>({ status: "idle" });
  const recorder = useRef<AudioRecorder | null>(null);
  const sending = useRef(false);

  const finishRecording = useCallback(async () => {
    try {
      setState({ status: "recorded", wav: await (recorder.current as AudioRecorder).stop() });
    } catch (error) {
      setState({ status: "error", message: messageOf(error) });
    }
  }, []);

  const start = useCallback(async () => {
    const created = (createRecorder ?? ((onAutoStop) => createAudioRecorder({ onAutoStop })))(
      () => void finishRecording(),
    );
    recorder.current = created;
    try {
      await created.start();
      setState({ status: "recording" });
    } catch (error) {
      setState({ status: "error", message: messageOf(error) });
    }
  }, [createRecorder, finishRecording]);

  const stop = useCallback(() => finishRecording(), [finishRecording]);

  const submit = useCallback(
    async (wav: Blob) => {
      if (sending.current) return;
      sending.current = true;
      setState({ status: "sending" });
      try {
        setState({ status: "done", result: await send(attemptId, wav) });
      } catch (error) {
        setState({ status: "error", message: messageOf(error), wav });
      } finally {
        sending.current = false;
      }
    },
    [attemptId, send],
  );

  const reset = useCallback(() => {
    recorder.current?.cancel();
    setState({ status: "idle" });
  }, []);

  useEffect(() => () => recorder.current?.cancel(), []);

  return { state, start, stop, submit, reset };
}
