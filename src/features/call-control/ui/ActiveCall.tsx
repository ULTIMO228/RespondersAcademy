"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { formatDuration } from "@/shared/lib";
import type { Clock } from "@/shared/lib";
import { Button, Input, TimerBadge } from "@/shared/ui";

import { CALL_STATE_TITLES } from "../config/callControl";
import { getVoiceNote } from "../lib/voiceNote";
import type { CallResponder, CallState, CallTarget, FinishedCall } from "../model/types";
import { useActiveCall } from "../model/useActiveCall";
import { CallTranscript } from "./CallTranscript";
import { HandsetIcon } from "./HandsetIcon";

import styles from "./ActiveCall.module.css";

type ActiveCallProps = {
  target: CallTarget;
  responder: CallResponder;
  clock?: Clock;
  onFinish?: (call: FinishedCall) => void;
};

const EMPTY_TEXT: Record<CallState, string> = {
  calling: "Ожидание ответа абонента…",
  talking: "Абонент на линии",
  finished: "Реплик нет",
};

/** Экран активного вызова: состояние, таймер разговора, транскрипт с ИИ-абонентом, «Завершить». */
export function ActiveCall({ target, responder, clock, onFinish }: ActiveCallProps) {
  const call = useActiveCall({ target, responder, clock, onFinish });
  const [reply, setReply] = useState("");
  const canReply = call.state === "talking" && !call.isPending;

  function handleReplySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canReply || reply.trim() === "") return;
    call.sendReply(reply);
    setReply("");
  }

  return (
    <div className={styles.call} data-state={call.state}>
      <div className={[styles.call__row, styles[`call__row--${call.state}`]].join(" ")}>
        <span className={styles.call__number}>{target.number}</span>
        <span className={styles.call__subscriber}>{target.subscriberTitle}</span>
        <span className={styles.call__state} aria-live="polite">
          {CALL_STATE_TITLES[call.state]}
        </span>
        <TimerBadge value={formatDuration(call.talkMs)} caption="длительность" />
      </div>
      <CallTranscript
        number={target.number}
        lines={call.lines}
        voiceNote={getVoiceNote(call.voice, target.subscriberTitle)}
        emptyText={EMPTY_TEXT[call.state]}
      />
      {call.error ? (
        <p className={styles.call__error} role="alert">
          {call.error}
        </p>
      ) : null}
      <form className={styles.call__reply} onSubmit={handleReplySubmit}>
        <Input
          label="Реплика диспетчера"
          value={reply}
          onChange={(event) => setReply(event.target.value)}
          disabled={call.state !== "talking"}
          placeholder="Сообщите адрес и суть происшествия"
          className={styles["call__reply-input"]}
        />
        <Button type="submit" variant="blue" disabled={!canReply || reply.trim() === ""}>
          Отправить
        </Button>
      </form>
      <div className={styles.call__actions}>
        <Button
          variant="danger"
          onClick={call.hangUp}
          disabled={call.state === "finished"}
          title="Завершить вызов"
        >
          <HandsetIcon isHungUp size={16} />
          Завершить
        </Button>
      </div>
    </div>
  );
}
