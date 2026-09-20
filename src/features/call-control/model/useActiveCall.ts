"use client";

import { useEffect, useRef, useState } from "react";

import { ApiError } from "@/shared/api";
import type { CallReply, CallVoice } from "@/shared/api";
import { systemClock } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import { CALL_TIMER_TICK_MS, RING_DELAY_MS } from "../config/callControl";
import { finishCall, toMoscowIso } from "../lib/phoneCall";
import type { CallResponder, CallState, CallTarget, FinishedCall, TranscriptLine } from "./types";

export type UseActiveCallOptions = {
  target: CallTarget;
  responder: CallResponder;
  clock?: Clock;
  /** Завершённый вызов (PhoneCall-данные) — для записи в попытку и журнал. */
  onFinish?: (call: FinishedCall) => void;
};

export type ActiveCallModel = {
  state: CallState;
  lines: readonly TranscriptLine[];
  voice: CallVoice | null;
  /** Длительность разговора (от ответа абонента), мс. */
  talkMs: number;
  /** Ждём реплику ИИ-абонента. */
  isPending: boolean;
  error: string | null;
  sendReply: (text: string) => void;
  hangUp: () => void;
};

const AI_FAILURE = "ИИ-абонент не ответил";

function describeError(error: unknown): string {
  return error instanceof ApiError ? `${AI_FAILURE}: ${error.message}` : AI_FAILURE;
}

/** Вызов точки C: «Вызов…» → (ответ ИИ через RING_DELAY_MS) «Разговор» → «Завершён»; таймер разговора. */
export function useActiveCall({ target, responder, clock = systemClock, onFinish }: UseActiveCallOptions) {
  const [startedAtMs] = useState(() => clock.now());
  const [state, setState] = useState<CallState>("calling");
  const [lines, setLines] = useState<readonly TranscriptLine[]>([]);
  const [voice, setVoice] = useState<CallVoice | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(startedAtMs);
  const [answeredAtMs, setAnsweredAtMs] = useState<number | null>(null);
  const endedAtRef = useRef<number | null>(null);
  const linesRef = useRef<readonly TranscriptLine[]>([]);

  function appendLine(speaker: TranscriptLine["speaker"], text: string) {
    linesRef.current = [...linesRef.current, { speaker, text, at: toMoscowIso(clock.now()) }];
    setLines(linesRef.current);
  }

  function handleAnswer(reply: CallReply) {
    if (endedAtRef.current !== null) return;
    setAnsweredAtMs(clock.now());
    appendLine("ai", reply.text);
    setVoice(reply.voice);
    setState("talking");
  }

  useRingAndAnswer(state === "calling", {
    target,
    responder,
    clock,
    onAnswer: handleAnswer,
    onError: setError,
  });
  useTalkTimer(state === "talking", clock, setNowMs);

  function sendReply(text: string) {
    const trimmed = text.trim();
    if (state !== "talking" || isPending || trimmed === "") return;
    appendLine("dispatcher", trimmed);
    setIsPending(true);
    responder
      .reply(target.number, trimmed)
      .then((reply) => endedAtRef.current === null && appendLine("ai", reply.text))
      .catch((reason: unknown) => setError(describeError(reason)))
      .finally(() => setIsPending(false));
  }

  function hangUp() {
    if (endedAtRef.current !== null) return;
    const endedAtMs = clock.now();
    endedAtRef.current = endedAtMs;
    setNowMs(endedAtMs);
    setState("finished");
    onFinish?.(finishCall(target, startedAtMs, endedAtMs, linesRef.current));
  }

  const talkMs = answeredAtMs === null ? 0 : Math.max(0, nowMs - answeredAtMs);
  return { state, lines, voice, talkMs, isPending, error, sendReply, hangUp } satisfies ActiveCallModel;
}

type RingOptions = {
  target: CallTarget;
  responder: CallResponder;
  clock: Clock;
  onAnswer: (reply: CallReply) => void;
  onError: (error: string) => void;
};

/** Гудки RING_DELAY_MS, затем ИИ-абонент снимает трубку («Слушаю вас»). Отбой/unmount — таймер очищается. */
function useRingAndAnswer(isRinging: boolean, options: RingOptions) {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    if (!isRinging) return undefined;
    let isCancelled = false;
    const { clock } = optionsRef.current;
    const handle = clock.setTimeout(() => {
      const { responder, target } = optionsRef.current;
      responder
        .answer(target.number)
        .then((reply) => !isCancelled && optionsRef.current.onAnswer(reply))
        .catch((reason: unknown) => !isCancelled && optionsRef.current.onError(describeError(reason)));
    }, RING_DELAY_MS);
    return () => {
      isCancelled = true;
      clock.clearTimeout(handle);
    };
  }, [isRinging]);
}

/** Тик таймера разговора, пока идёт разговор; интервал очищается при завершении/unmount. */
function useTalkTimer(isTalking: boolean, clock: Clock, setNowMs: (now: number) => void) {
  useEffect(() => {
    if (!isTalking) return undefined;
    const interval = setInterval(() => setNowMs(clock.now()), CALL_TIMER_TICK_MS);
    return () => clearInterval(interval);
  }, [isTalking, clock, setNowMs]);
}
