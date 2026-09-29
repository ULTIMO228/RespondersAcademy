"use client";

import { useEffect, useRef, useState } from "react";

import type { AssignmentFormat, OperatorAttempt } from "@/shared/api";
import { AiBadge, Button, TimerBadge } from "@/shared/ui";
import { HandsetIcon } from "@/features/call-control";
import {
  answerWait,
  canAnswer,
  formatClock,
  hasAnswerTimeout,
  isReplayBlocked,
  talkSeconds,
} from "@/entities/operator112-attempt";
import type { AttemptNorms } from "@/entities/operator112-attempt";

import { useCallerAudio } from "../model/useCallerAudio";
import type { CallerAudioLoader } from "../model/useCallerAudio";

import styles from "./Operator112Softphone.module.css";

export const EMERGENCY_AUDIO_NOTE = "Аварийный режим: аудио недоступно, показан текстовый транскрипт";
export const EXAM_REPLAY_NOTE = "Повторное прослушивание в экзамене запрещено";
const AI_VOICE_TITLE = "Речь заявителя синтезирована локальной моделью";

type Operator112SoftphoneProps = {
  attempt: OperatorAttempt;
  format: AssignmentFormat | null;
  norms: AttemptNorms;
  /** «Сейчас» из useNow: экран тикает раз в секунду, виджет сам таймеров не заводит. */
  nowMs: number;
  isAnswering?: boolean;
  onAnswer: () => void;
  /** Тренировка: повторное прослушивание фиксируется событием replay (в экзамене кнопки нет). */
  onReplay?: () => void;
  audioLoader?: CallerAudioLoader;
};

/**
 * Софтфон режима «Специалист-112»: индикатор входящего вызова, отсчёт ожидания ответа против норматива, «Ответить», таймер
 * разговора, плеер записи заявителя, аварийный транскрипт. Оформление — токены softphone/АРМ, форм новых контролов нет.
 */
export function Operator112Softphone({
  attempt,
  format,
  norms,
  nowMs,
  isAnswering = false,
  onAnswer,
  onReplay,
  audioLoader,
}: Operator112SoftphoneProps) {
  const audio = useCallerAudio({ attempt, format, loader: audioLoader });
  const isRinging = canAnswer(attempt);
  const wait = answerWait(attempt, norms.answerSec, nowMs);
  const talkSec = talkSeconds(attempt, nowMs);
  const isExam = format === "exam";

  return (
    <section
      className={styles.softphone}
      aria-label="Софтфон 112"
      data-state={attempt.state}
      data-exceeded={wait.exceeded}
    >
      <header className={styles.softphone__header}>
        <span className={styles.softphone__handset} data-ringing={isRinging}>
          <HandsetIcon />
        </span>
        <div className={styles.softphone__caller}>
          <strong className={styles.softphone__aon}>{attempt.aon}</strong>
          <span className={styles.softphone__note}>Происшествие № {attempt.incidentNumber}</span>
        </div>
        <span className={styles.softphone__status} aria-live="polite">
          {isRinging ? "Входящий вызов" : attempt.state === "answered" ? "Разговор" : "Вызов завершён"}
        </span>
      </header>

      {isRinging ? (
        <div className={styles.softphone__ringing}>
          <TimerBadge
            value={formatClock(wait.elapsedSec)}
            exceeded={wait.exceeded}
            caption="ожидание ответа"
            size="lg"
          />
          <p className={styles.softphone__norm} data-exceeded={wait.exceeded}>
            {wait.exceeded
              ? `Норматив ответа ${norms.answerSec} с превышен`
              : `Норматив ответа — ${norms.answerSec} с`}
          </p>
          <Button
            variant="primary"
            size="lg"
            className={styles.softphone__answer}
            onClick={onAnswer}
            disabled={isAnswering}
            title="Ответить на вызов"
          >
            {isAnswering ? "Соединение…" : "Ответить на вызов"}
          </Button>
        </div>
      ) : (
        <div className={styles.softphone__talk}>
          <TimerBadge value={formatClock(talkSec)} caption="разговор" />
          {hasAnswerTimeout(attempt) ? (
            <span className={styles.softphone__flag} data-testid="answer-timeout">
              Ответ позже норматива {norms.answerSec} с
            </span>
          ) : null}
        </div>
      )}

      {attempt.state === "answered" ? (
        <CallerRecording
          audio={audio}
          transcript={attempt.audio?.transcript ?? ""}
          isExam={isExam}
          isBlockedByServer={isReplayBlocked(attempt, format)}
          onReplay={onReplay}
        />
      ) : null}
    </section>
  );
}

type RecordingProps = {
  audio: ReturnType<typeof useCallerAudio>;
  transcript: string;
  isExam: boolean;
  isBlockedByServer: boolean;
  onReplay?: () => void;
};

function CallerRecording({ audio, transcript, isExam, isBlockedByServer, onReplay }: RecordingProps) {
  const player = useRef<HTMLAudioElement>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const url = audio.status === "ready" ? audio.url : null;

  useEffect(() => {
    setNeedsGesture(false);
    if (!url || !player.current) return;
    const started = player.current.play();
    if (started && typeof started.catch === "function") started.catch(() => setNeedsGesture(true));
  }, [url]);

  if (audio.status === "idle" || audio.status === "loading") {
    return (
      <p className={styles.softphone__note} role="status">
        Загрузка записи…
      </p>
    );
  }
  if (audio.status === "denied" || (isBlockedByServer && audio.status !== "ready")) {
    return (
      <p className={styles.softphone__denied} role="alert">
        {EXAM_REPLAY_NOTE}
      </p>
    );
  }
  if (audio.status === "emergency") {
    return (
      <div className={styles.softphone__transcript} data-testid="emergency-transcript">
        <p className={styles.softphone__emergency} role="status">
          {EMERGENCY_AUDIO_NOTE}
        </p>
        <p className={styles.softphone__text}>{transcript || "Расшифровка недоступна"}</p>
      </div>
    );
  }
  return (
    <div className={styles.softphone__player}>
      <div className={styles.softphone__playerhead}>
        <span>Запись заявителя</span>
        <AiBadge title={AI_VOICE_TITLE} />
      </div>
      {/* Экзамен: без нативных контролов — запись проигрывается один раз, повтор блокируется на сервере (409). */}
      <audio ref={player} src={audio.url} controls={!isExam} preload="auto" />
      {needsGesture ? (
        <Button size="sm" onClick={() => void player.current?.play().then(() => setNeedsGesture(false))}>
          Воспроизвести запись
        </Button>
      ) : null}
      {!isExam && onReplay ? (
        <Button
          size="sm"
          onClick={() => {
            onReplay();
            if (player.current) player.current.currentTime = 0;
            void player.current?.play();
          }}
        >
          Прослушать ещё раз
        </Button>
      ) : null}
      {isExam ? <span className={styles.softphone__note}>{EXAM_REPLAY_NOTE}</span> : null}
    </div>
  );
}
