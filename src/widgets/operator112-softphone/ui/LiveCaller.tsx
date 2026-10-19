"use client";

import { useEffect, useRef, useState } from "react";

import { AiBadge, Button, TimerBadge } from "@/shared/ui";
import { HandsetIcon } from "@/features/call-control";
import { answerWait, formatClock, hasAnswerTimeout, talkSeconds } from "@/entities/operator112-attempt";

import { useLiveCaller } from "../model/useLiveCaller";
import type { LiveCallerDeps } from "../model/useLiveCaller";
import type { Operator112SoftphoneProps } from "./Operator112Softphone";
import styles from "./Operator112Softphone.module.css";

export function LiveCaller({
  attempt,
  norms,
  nowMs,
  onAnswer,
  isAnswering,
  deps,
}: Operator112SoftphoneProps & { deps?: LiveCallerDeps }) {
  const call = useLiveCaller(attempt.id, attempt.state === "answered", deps);
  const [checking, setChecking] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ringing = attempt.state === "ringing";
  const wait = answerWait(attempt, norms.answerSec, nowMs);

  const answer = async () => {
    if (checking || isAnswering) return;
    setChecking(true);
    try {
      const connected = await call.connectMicrophone();
      if (connected && mounted.current) onAnswer();
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className={styles.softphone} aria-label="Софтфон 112" data-state={attempt.state}>
      <header className={styles.softphone__header}>
        <span className={styles.softphone__handset} data-ringing={ringing}>
          <HandsetIcon />
        </span>
        <div className={styles.softphone__caller}>
          <strong className={styles.softphone__aon}>{attempt.aon}</strong>
          <span className={styles.softphone__note}>Происшествие № {attempt.incidentNumber}</span>
        </div>
        <span className={styles.softphone__status} role="status">
          {ringing ? "Входящий вызов" : call.phase === "ended" ? "Разговор завершён" : "Разговор с ИИ"}
        </span>
      </header>
      <TimerBadge
        value={formatClock(
          ringing
            ? wait.elapsedSec
            : talkSeconds(attempt, call.record?.endedAt ? Date.parse(call.record.endedAt) : nowMs),
        )}
        caption={ringing ? "ожидание ответа" : "разговор"}
        exceeded={ringing && wait.exceeded}
      />
      {ringing ? (
        <p className={styles.softphone__norm} data-exceeded={wait.exceeded}>
          {wait.exceeded
            ? `Норматив ответа ${norms.answerSec} с превышен`
            : `Норматив ответа — ${norms.answerSec} с`}
        </p>
      ) : hasAnswerTimeout(attempt) ? (
        <span className={styles.softphone__flag}>Ответ позже норматива {norms.answerSec} с</span>
      ) : null}
      {call.error ? (
        <p role="alert" className={styles.softphone__emergency}>
          {call.error}
        </p>
      ) : null}
      {ringing ? (
        <Button
          variant="primary"
          size="lg"
          className={styles.softphone__answer}
          disabled={checking || isAnswering}
          onClick={() => void answer()}
        >
          {checking || isAnswering ? "Соединение…" : "Ответить на вызов"}
        </Button>
      ) : (
        <>
          <AiBadge title="ИИ-заявитель отвечает по фактам учебного билета" />
          {call.phase !== "ended" ? (
            <p className={styles.softphone__note}>
              Говорите в гарнитуру. После паузы вопрос отправится автоматически. Заявителя можно перебить.
            </p>
          ) : null}
          {call.phase === "loading" ? <p role="status">Подготовка разговора…</p> : null}
          {call.phase === "thinking" ? <p role="status">Заявитель готовит ответ…</p> : null}
          {call.phase === "speaking" ? <p role="status">Слышу вас…</p> : null}
          {call.phase === "playing" ? <p role="status">Заявитель отвечает — можно говорить</p> : null}
          {call.phase === "listening" && call.connected && !call.muted ? (
            <p role="status">Слушаю вас</p>
          ) : null}
          {call.phase !== "ended" ? (
            <div className={styles.softphone__talk}>
              <Button onClick={call.toggleMicrophone} disabled={checking}>
                {!call.connected
                  ? "Включить микрофон"
                  : call.muted
                    ? "Включить микрофон"
                    : "Выключить микрофон"}
              </Button>
              <meter aria-label="Уровень микрофона" min={0} max={1} value={call.level} />
              <span>{call.connected && !call.muted ? "Микрофон включён" : "Микрофон выключен"}</span>
            </div>
          ) : null}
          {call.error && !call.record && call.phase !== "ended" ? (
            <Button onClick={() => void call.start()}>Повторить подключение</Button>
          ) : null}
          {call.error && call.canRetry ? (
            <Button onClick={() => void call.retry()}>Повторить отправку</Button>
          ) : null}
          {call.phase !== "ended" ? (
            <Button onClick={() => void call.finish()}>Завершить разговор</Button>
          ) : null}
          {call.phase === "ended" && call.error ? (
            <Button onClick={() => void call.finish()}>Повторить сохранение</Button>
          ) : null}
          <ReplyAudio blob={call.audio} onEnded={call.playbackEnded} />
          {call.record?.transcript.length ? (
            <details>
              <summary>Расшифровка учебного разговора</summary>
              {call.record.transcript.map((line, index) => (
                <p key={`${line.turnId}-${index}`}>
                  <strong>{line.speaker === "caller" ? "Заявитель" : "Оператор"}:</strong> {line.text}
                </p>
              ))}
            </details>
          ) : null}
          <p className={styles.softphone__note}>
            Прототип: оценка разговора требует проверки преподавателем.
          </p>
        </>
      )}
    </section>
  );
}

function ReplyAudio({ blob, onEnded }: { blob: Blob | null; onEnded: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const player = useRef<HTMLAudioElement>(null);
  const [manual, setManual] = useState(false);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  useEffect(() => {
    setManual(false);
    const element = player.current;
    if (url) void element?.play().catch(() => setManual(true));
    return () => {
      element?.pause();
    };
  }, [url]);
  return url ? (
    <div className={styles.softphone__player}>
      <audio ref={player} src={url} controls onEnded={onEnded} />
      {manual ? <p>Нажмите воспроизведение: браузер заблокировал автоматический звук.</p> : null}
    </div>
  ) : null;
}
