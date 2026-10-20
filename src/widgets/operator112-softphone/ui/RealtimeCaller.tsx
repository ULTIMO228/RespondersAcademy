"use client";

import { AiBadge, Button, TimerBadge } from "@/shared/ui";
import { HandsetIcon } from "@/features/call-control";
import { answerWait, formatClock, talkSeconds, useRealtimeCaller } from "@/entities/operator112-attempt";
import type { Operator112SoftphoneProps } from "./Operator112Softphone";
import styles from "./Operator112Softphone.module.css";

export function RealtimeCaller({ attempt, norms, nowMs, onAnswer, isAnswering }: Operator112SoftphoneProps) {
  const call = useRealtimeCaller(attempt.id, attempt.state === "answered");
  const ringing = attempt.state === "ringing";
  const wait = answerWait(attempt, norms.answerSec, nowMs);
  const active = ["listening", "thinking", "speaking"].includes(call.phase);
  const finished = attempt.state !== "ringing" && attempt.state !== "answered";
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
        <AiBadge title="Потоковый голосовой заявитель" />
      </header>
      <TimerBadge
        value={formatClock(ringing ? wait.elapsedSec : talkSeconds(attempt, nowMs))}
        caption={ringing ? "ожидание ответа" : "разговор"}
        exceeded={ringing && wait.exceeded}
      />
      <p role="status" className={styles.softphone__note}>
        {finished || call.phase === "ended"
          ? "Разговор завершён"
          : call.configured === null
            ? "Проверка голосового соединения…"
            : !call.configured
              ? "Голосовой сервер ещё не подключён. Ожидается настройка сервера."
              : call.phase === "connecting"
                ? "Подключение голоса…"
                : call.muted
                  ? "Микрофон выключен"
                  : call.phase === "thinking"
                    ? "Заявитель готовит ответ…"
                    : active
                      ? call.lastHeard
                        ? "Микрофон включён — заявителя можно перебивать"
                        : "Микрофон включён — заявитель начинает разговор"
                      : ringing
                        ? "Входящий вызов"
                        : "Подключите гарнитуру для разговора"}
      </p>
      {call.lastHeard ? <p className={styles.softphone__note}>Вы: {call.lastHeard}</p> : null}
      {call.lastCaller ? <p className={styles.softphone__note}>Заявитель: {call.lastCaller}</p> : null}
      {call.error ? (
        <p role="alert" className={styles.softphone__emergency}>
          {call.error}
        </p>
      ) : null}
      {!finished && call.configured && !active && call.phase !== "connecting" ? (
        <Button
          variant="primary"
          size="lg"
          disabled={isAnswering}
          onClick={() => {
            void call.prepare().then((ready) => {
              if (ready && ringing) onAnswer();
            });
          }}
        >
          {ringing ? "Ответить на вызов" : "Подключить голос"}
        </Button>
      ) : null}
      {active ? (
        <>
          <meter min={0} max={1} value={call.level} aria-label="Уровень микрофона" />
          <Button size="sm" onClick={call.mute}>
            {call.muted ? "Включить микрофон" : "Выключить микрофон"}
          </Button>
          <Button size="sm" onClick={call.finish}>
            Завершить разговор
          </Button>
        </>
      ) : null}
    </section>
  );
}
