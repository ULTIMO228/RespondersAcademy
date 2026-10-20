"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, liveCallApi } from "@/shared/api";
import type { LiveCallRecord } from "@/shared/api";
import { createVoiceCapture } from "@/shared/lib/live-call";
import type { VoiceCapture } from "@/shared/lib/live-call";

export type LiveCallerDeps = { api: typeof liveCallApi; capture: typeof createVoiceCapture };
export const LIVE_CALLER_DEPS: LiveCallerDeps = { api: liveCallApi, capture: createVoiceCapture };
type Phase = "idle" | "loading" | "listening" | "speaking" | "thinking" | "playing" | "ended";
type Turn = { id: string; blob: Blob };

export function useLiveCaller(id: string, answered: boolean, deps: LiveCallerDeps = LIVE_CALLER_DEPS) {
  const [record, setRecord] = useState<LiveCallRecord | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const alive = useRef(false);
  const stopped = useRef(false);
  const busy = useRef(false);
  const speaking = useRef(false);
  const mutedRef = useRef(false);
  const capture = useRef<VoiceCapture | null>(null);
  const microphoneStart = useRef<Promise<boolean> | null>(null);
  const started = useRef<Promise<LiveCallRecord> | null>(null);
  const initializing = useRef<Promise<void> | null>(null);
  const current = useRef<LiveCallRecord | null>(null);
  const revision = useRef(0);
  const queue = useRef<Turn[]>([]);
  const receive = useRef<(blob: Blob) => void>(() => undefined);

  const update = useCallback((value: LiveCallRecord) => {
    current.current = value;
    setRecord(value);
  }, []);

  const fail = useCallback((reason: unknown) => {
    if (!alive.current || stopped.current) return;
    setError(reason instanceof Error ? reason.message : "Ошибка голосового разговора");
    mutedRef.current = true;
    setMuted(true);
    speaking.current = false;
    capture.current?.setEnabled(false);
    setAudio(null);
    setPhase("listening");
  }, []);

  const apply = useCallback(
    async (result: LiveCallRecord, version: number) => {
      if (!alive.current || stopped.current) return;
      update(result);
      if (result.status === "ended") {
        stopped.current = true;
        capture.current?.stop();
        setConnected(false);
        setLevel(0);
        setAudio(null);
        setPhase("ended");
        return;
      }
      capture.current?.setEnabled(!mutedRef.current);
      const last = result.transcript.filter((line) => line.speaker === "caller").at(-1);
      if (last && version === revision.current && !speaking.current && queue.current.length === 0) {
        const blob = await deps.api.audio(id, last.turnId);
        if (!alive.current || stopped.current) return;
        if (version === revision.current && !speaking.current && queue.current.length === 0) {
          setAudio(blob);
          setPhase("playing");
          return;
        }
      }
      setPhase(speaking.current ? "speaking" : "listening");
    },
    [deps, id, update],
  );

  const drain = useCallback(async () => {
    if (busy.current || stopped.current || !alive.current) return;
    busy.current = true;
    try {
      while (queue.current.length && !stopped.current && alive.current) {
        const turn = queue.current[0];
        const version = revision.current;
        if (!speaking.current) setPhase("thinking");
        try {
          const result = await deps.api.turn(id, turn.id, turn.blob);
          if (!alive.current || stopped.current) return;
          queue.current.shift();
          // Если WAV ещё не загрузился, повтор UUID должен вернуть эту же реплику.
          try {
            await apply(result, version);
          } catch (reason) {
            queue.current.unshift(turn);
            throw reason;
          }
        } catch (reason) {
          if (reason instanceof ApiError && reason.status === 400) {
            queue.current.shift();
            setError("Не разобрал фразу. Повторите вопрос — микрофон слушает");
            setPhase("listening");
            continue;
          }
          fail(reason);
          break;
        }
      }
    } finally {
      busy.current = false;
    }
  }, [apply, deps, fail, id]);

  receive.current = (blob) => {
    if (!alive.current || stopped.current || mutedRef.current || current.current?.status !== "active") return;
    if (queue.current.length >= 3) {
      fail(new Error("Накопилось несколько вопросов. Дождитесь обработки и включите микрофон"));
      return;
    }
    queue.current.push({ id: crypto.randomUUID(), blob });
    setError(null);
    void drain();
  };

  const connectMicrophone = useCallback((): Promise<boolean> => {
    if (microphoneStart.current) return microphoneStart.current;
    if (stopped.current) return Promise.resolve(false);
    if (capture.current) {
      mutedRef.current = false;
      setMuted(false);
      setError(null);
      capture.current.setEnabled(current.current?.status === "active");
      return Promise.resolve(true);
    }
    const value = deps.capture({
      onLevel: (value) => {
        if (alive.current) setLevel(value);
      },
      onSpeechStart: () => {
        if (!alive.current || stopped.current || mutedRef.current) return;
        revision.current += 1;
        speaking.current = true;
        setAudio(null);
        setPhase("speaking");
      },
      onSpeechEnd: () => {
        speaking.current = false;
        if (alive.current && !stopped.current) setPhase(busy.current ? "thinking" : "listening");
      },
      onUtterance: (blob) => receive.current(blob),
      onError: (reason) => {
        capture.current?.stop();
        capture.current = null;
        if (alive.current) setConnected(false);
        fail(reason);
      },
    });
    capture.current = value;
    microphoneStart.current = value
      .start()
      .then(() => {
        if (!alive.current || stopped.current) {
          value.stop();
          return false;
        }
        mutedRef.current = false;
        setMuted(false);
        setConnected(true);
        setError(null);
        value.setEnabled(current.current?.status === "active");
        return true;
      })
      .catch((reason: unknown) => {
        value.stop();
        if (capture.current === value) capture.current = null;
        fail(reason);
        return false;
      })
      .finally(() => {
        microphoneStart.current = null;
      });
    return microphoneStart.current;
  }, [deps, fail]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      queueMicrotask(() => {
        if (alive.current) return;
        stopped.current = true;
        capture.current?.stop();
        if (started.current) void started.current.then(() => deps.api.finish(id)).catch(() => undefined);
      });
    };
  }, [deps, id]);

  const start = useCallback(() => {
    if (initializing.current) return initializing.current;
    setError(null);
    setPhase("loading");
    stopped.current = false;
    if (!started.current) started.current = deps.api.start(id);
    const version = revision.current;
    initializing.current = started.current
      .then((result) => apply(result, version))
      .catch((reason: unknown) => {
        started.current = null;
        fail(reason);
      })
      .finally(() => {
        initializing.current = null;
      });
    return initializing.current;
  }, [apply, deps, fail, id]);

  const finish = useCallback(async () => {
    stopped.current = true;
    revision.current += 1;
    queue.current = [];
    capture.current?.stop();
    capture.current = null;
    speaking.current = false;
    setAudio(null);
    setConnected(false);
    setLevel(0);
    setPhase("ended");
    setError(null);
    try {
      await started.current;
      const result = await deps.api.finish(id);
      if (alive.current) update(result);
    } catch (reason) {
      if (alive.current)
        setError(reason instanceof Error ? reason.message : "Не удалось сохранить завершение разговора");
    }
  }, [deps, id, update]);

  useEffect(() => {
    if (answered) void start();
    else if (started.current && !stopped.current) void finish();
  }, [answered, finish, start]);

  useEffect(() => {
    if (record?.status !== "active" || !record.startedAt || !record.maxDurationSec) return;
    const timer = setTimeout(
      () => void finish(),
      Math.max(0, Date.parse(record.startedAt) + record.maxDurationSec * 1000 - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [finish, record]);

  const toggleMicrophone = useCallback(() => {
    if (!connected || mutedRef.current) {
      void connectMicrophone();
      return;
    }
    mutedRef.current = true;
    speaking.current = false;
    setMuted(true);
    setLevel(0);
    capture.current?.setEnabled(false);
    if (!busy.current) setPhase("listening");
  }, [connectMicrophone, connected]);

  const retry = useCallback(async () => {
    if (!(await connectMicrophone())) return;
    if (queue.current.length) await drain();
    else if (!current.current) await start();
  }, [connectMicrophone, drain, start]);

  const playbackEnded = useCallback(() => {
    if (alive.current && !stopped.current && !busy.current && !speaking.current) setPhase("listening");
  }, []);

  return {
    phase,
    record,
    error,
    audio,
    connected,
    muted,
    level,
    start,
    connectMicrophone,
    toggleMicrophone,
    retry,
    finish,
    playbackEnded,
    canRetry: Boolean(queue.current.length),
  };
}
