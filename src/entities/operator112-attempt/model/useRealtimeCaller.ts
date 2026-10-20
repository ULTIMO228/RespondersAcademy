import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeCallApi } from "@/shared/api";
import type { RealtimeConnection, RealtimeEvent } from "@/shared/api";
import { createDuplex } from "@/shared/lib/realtime-audio";
import type { Duplex } from "@/shared/lib/realtime-audio";

type Phase = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "ended" | "error";
export function useRealtimeCaller(attemptId: string, answered: boolean) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [lastCaller, setLastCaller] = useState("");
  const audio = useRef<Duplex | null>(null);
  const connection = useRef<RealtimeConnection | null>(null);
  const alive = useRef(false);

  const dispose = useCallback(() => {
    connection.current?.close();
    connection.current = null;
    audio.current?.stop();
    audio.current = null;
  }, []);
  const fail = useCallback(
    (reason: unknown) => {
      dispose();
      if (alive.current) {
        setPrepared(false);
        setLevel(0);
        setPhase("error");
        setError(reason instanceof Error ? reason.message : "Не удалось подключить голосовую модель");
      }
    },
    [dispose],
  );

  useEffect(() => {
    alive.current = true;
    let current = true;
    setConfigured(null);
    setError("");
    setPhase("idle");
    setPrepared(false);
    void realtimeCallApi.status().then(
      (result) => {
        if (current) setConfigured(result.configured);
      },
      (reason) => {
        if (current) {
          setConfigured(false);
          setError(reason instanceof Error ? reason.message : "Нет связи с сервером");
        }
      },
    );
    return () => {
      current = false;
      alive.current = false;
      dispose();
    };
  }, [attemptId, dispose]);

  const prepare = useCallback(async () => {
    if (!configured || audio.current) return false;
    setPhase("connecting");
    setError("");
    setMuted(false);
    setLastHeard("");
    setLastCaller("");
    const duplex = createDuplex({
      onAudio: (pcm) => connection.current?.sendAudio(pcm),
      onLevel: setLevel,
      onError: fail,
    });
    audio.current = duplex;
    try {
      await duplex.prepare();
      if (!alive.current || audio.current !== duplex) {
        duplex.stop();
        return false;
      }
      setPrepared(true);
      return true;
    } catch (reason) {
      if (audio.current === duplex) fail(reason);
      return false;
    }
  }, [configured, fail]);

  useEffect(() => {
    if (!prepared || !audio.current) return;
    if (!answered) {
      // Answer API может завершиться ошибкой; не оставляем захват навечно.
      const timer = setTimeout(() => fail(new Error("Вызов не принят. Повторите подключение")), 15000);
      return () => clearTimeout(timer);
    }
    const duplex = audio.current;
    let current = true;
    const receive = (event: RealtimeEvent) => {
      if (!current || audio.current !== duplex) return;
      const id = event.response_id ?? event.response?.id ?? "";
      try {
        switch (event.type) {
          case "ready":
            duplex.transmit();
            setPhase("listening");
            break;
          case "input_audio_buffer.speech_started":
            for (const item of duplex.speechStarted())
              if (item.itemId) connection.current?.truncate(item.itemId, item.milliseconds);
            setPhase("listening");
            break;
          case "input_audio_buffer.speech_stopped":
            duplex.speechStopped();
            break;
          case "input_audio_buffer.committed":
            duplex.committed();
            setPhase("thinking");
            break;
          case "response.created":
            setLastCaller("");
            duplex.begin(id, event.response?.interrupting === true);
            break;
          case "conversation.item.input_audio_transcription.completed":
            setLastHeard(event.transcript ?? "");
            break;
          case "response.text.delta":
            if (event.delta) setLastCaller((text) => text + (event.delta ?? ""));
            break;
          case "response.audio.delta":
            if (event.delta) {
              duplex.play(id, event.item_id, event.delta);
              setPhase("speaking");
            }
            break;
          case "response.done":
            duplex.done(id);
            setPhase("listening");
            break;
          case "ended":
            dispose();
            setPrepared(false);
            setLevel(0);
            setPhase("ended");
            break;
          case "error":
            fail(new Error(event.message ?? "Ошибка голосовой модели"));
            break;
        }
      } catch (reason) {
        fail(reason);
      }
    };
    void realtimeCallApi
      .ticket(attemptId)
      .then((access) => {
        if (!current || audio.current !== duplex) return;
        connection.current = realtimeCallApi.connect(access, receive, () => {
          if (current && audio.current === duplex)
            fail(new Error("Голосовое соединение закрылось. Подключитесь повторно"));
        });
      })
      .catch((reason: unknown) => {
        if (current && audio.current === duplex) fail(reason);
      });
    return () => {
      current = false;
      dispose();
    };
  }, [attemptId, answered, prepared, fail, dispose]);

  return {
    configured,
    phase,
    error,
    level,
    muted,
    lastHeard,
    lastCaller,
    prepare,
    mute() {
      audio.current?.mute(!muted);
      setMuted(!muted);
    },
    finish() {
      dispose();
      setPrepared(false);
      setLevel(0);
      setPhase("ended");
    },
  };
}
