"use client";

import { useEffect, useRef, useState } from "react";

import type { AssignmentFormat, OperatorAttempt } from "@/shared/api";
import { AiBadge } from "@/shared/ui";
import { isReplayBlocked } from "@/entities/operator112-attempt";

import { useCallerAudio } from "../model/useCallerAudio";
import type { CallerAudioLoader } from "../model/useCallerAudio";

import styles from "./CallWindows.module.css";

export const EMERGENCY_AUDIO_NOTE = "Аварийный режим: аудио недоступно, показан текстовый транскрипт";
export const EXAM_REPLAY_NOTE = "Повторное прослушивание в экзамене запрещено";
const AI_VOICE_TITLE = "Речь заявителя синтезирована локальной моделью";

type CallRecordingWindowProps = {
  attempt: OperatorAttempt;
  format: AssignmentFormat | null;
  /** Окно открыто кнопкой «записи звонков». Голос играет и при закрытом окне — как в гарнитуре. */
  isOpen: boolean;
  onClose: () => void;
  /** Тренировка: повторное прослушивание фиксируется событием replay (в экзамене кнопки нет). */
  onReplay?: () => void;
  audioLoader?: CallerAudioLoader;
};

/**
 * Запись разговора с заявителем после «Принять»: звук запускается сам, окно «Записи звонков» даёт повтор в тренировке.
 * Аварийный режим (аудио нет) открывает окно само: иначе ученик не узнает, что сказал заявитель.
 */
export function CallRecordingWindow({
  attempt,
  format,
  isOpen,
  onClose,
  onReplay,
  audioLoader,
}: CallRecordingWindowProps) {
  const audio = useCallerAudio({ attempt, format, loader: audioLoader });
  const player = useRef<HTMLAudioElement>(null);
  const [needsGesture, setNeedsGesture] = useState(false);
  const url = audio.status === "ready" ? audio.url : null;
  const isExam = format === "exam";
  const [isDismissed, setDismissed] = useState(false);
  const isLoading = audio.status === "idle" || audio.status === "loading";
  const isBlocked =
    !isLoading &&
    (audio.status === "denied" || (isReplayBlocked(attempt, format) && audio.status !== "ready"));
  // Окно открывается само, когда ученику нужно что-то сделать или прочитать; «×» закрывает до следующего открытия.
  const needsAttention = isBlocked || needsGesture || (audio.status === "emergency" && !isBlocked);
  const isVisible = isOpen || (needsAttention && !isDismissed);
  const close = () => {
    setDismissed(true);
    onClose();
  };

  useEffect(() => {
    setNeedsGesture(false);
    if (!url || !player.current) return;
    const started = player.current.play();
    if (started && typeof started.catch === "function") started.catch(() => setNeedsGesture(true));
  }, [url]);

  return (
    <section className={styles.records} hidden={!isVisible} aria-label="Записи звонков">
      <header className={styles.records__head}>
        <span>Записи звонков</span>
        {audio.status === "ready" ? <AiBadge title={AI_VOICE_TITLE} /> : null}
        <button type="button" className={styles.records__close} aria-label="Закрыть записи" onClick={close}>
          ×
        </button>
      </header>
      {isLoading ? (
        <p className={styles.records__note} role="status">
          Загрузка записи…
        </p>
      ) : null}
      {isBlocked ? (
        <p className={styles.records__denied} role="alert">
          {EXAM_REPLAY_NOTE}
        </p>
      ) : null}
      {audio.status === "emergency" && !isBlocked ? (
        <div data-testid="emergency-transcript">
          <p className={styles.records__note} role="status">
            {EMERGENCY_AUDIO_NOTE}
          </p>
          <p className={styles.records__text}>{attempt.audio?.transcript || "Расшифровка недоступна"}</p>
        </div>
      ) : null}
      {audio.status === "ready" ? (
        <div className={styles.records__player}>
          {/* Экзамен: без нативных контролов — запись проигрывается один раз, повтор блокируется на сервере (409). */}
          <audio ref={player} src={audio.url} controls={!isExam} preload="auto" />
          {needsGesture ? (
            <button
              type="button"
              className={styles.records__button}
              onClick={() =>
                void player.current?.play().then(
                  () => setNeedsGesture(false),
                  () => undefined,
                )
              }
            >
              Воспроизвести запись
            </button>
          ) : null}
          {!isExam && onReplay ? (
            <button
              type="button"
              className={styles.records__button}
              onClick={() => {
                onReplay();
                if (player.current) player.current.currentTime = 0;
                player.current?.play().catch(() => setNeedsGesture(true));
              }}
            >
              Прослушать ещё раз
            </button>
          ) : null}
          {isExam ? <span className={styles.records__note}>{EXAM_REPLAY_NOTE}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
