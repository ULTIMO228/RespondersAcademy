"use client";

import { useEffect, useRef, useState } from "react";

import { fetchTicketAudioFile } from "@/shared/api";
import type { AssignmentFormat, OperatorAttempt } from "@/shared/api";
import { isEmergencyAudio, isReplayBlocked } from "@/entities/operator112-attempt";

/**
 * idle — вызов ещё не принят; loading — запрашиваем файл; ready — воспроизводим; emergency — аудио недоступно, работаем по
 * расшифровке (запись не готова, сбой синтеза, любой отказ кроме 409); denied — в экзамене запись уже прослушана (409).
 */
export type CallerAudioState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "emergency" }
  | { status: "denied" };

export type CallerAudioLoader = (cardId: string, signal?: AbortSignal) => Promise<Blob>;

const HTTP_CONFLICT = 409;

type Options = {
  attempt: OperatorAttempt;
  format: AssignmentFormat | null;
  loader?: CallerAudioLoader;
};

/**
 * Запись речи заявителя грузится ОДИН раз на попытку после «Ответить». В экзамене каждый запрос файла — учтённое прослушивание
 * (второй даёт 409), поэтому запрос не отменяется при размонтировании и не повторяется в StrictMode: промис хранится в ref.
 */
export function useCallerAudio({
  attempt,
  format,
  loader = fetchTicketAudioFile,
}: Options): CallerAudioState {
  const [state, setState] = useState<CallerAudioState>({ status: "idle" });
  const requested = useRef<{ attemptId: string; promise: Promise<CallerAudioState> } | null>(null);
  const answered = attempt.state === "answered";

  useEffect(() => {
    if (!answered) return undefined;
    let active = true;
    if (requested.current?.attemptId !== attempt.id) {
      let promise: Promise<CallerAudioState>;
      if (isReplayBlocked(attempt, format)) {
        promise = Promise.resolve<CallerAudioState>({ status: "denied" });
      } else if (isEmergencyAudio(attempt)) {
        promise = Promise.resolve<CallerAudioState>({ status: "emergency" });
      } else {
        promise = loader(attempt.cardId).then(
          (blob): CallerAudioState => ({ status: "ready", url: URL.createObjectURL(blob) }),
          (error: unknown): CallerAudioState => {
            const status = (error as { status?: number } | null)?.status;
            return status === HTTP_CONFLICT ? { status: "denied" } : { status: "emergency" };
          },
        );
      }
      requested.current = { attemptId: attempt.id, promise };
      setState({ status: "loading" });
    }
    void requested.current.promise.then((result) => {
      if (active) setState(result);
    });
    return () => {
      active = false;
    };
    // attempt меняется при каждом обновлении с сервера; запрос привязан к id попытки и состоянию «ответил».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answered, attempt.id]);

  useEffect(
    () => () => {
      void requested.current?.promise.then((result) => {
        if (result.status === "ready") URL.revokeObjectURL(result.url);
      });
    },
    [],
  );

  return state;
}
