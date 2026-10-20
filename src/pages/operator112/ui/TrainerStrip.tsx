"use client";

import {
  answerWait,
  examRemainingSec,
  formatClock,
  hasAnswerTimeout,
  processingWait,
} from "@/entities/operator112-attempt";
import type { ApplicantVoice, AttemptNorms } from "@/entities/operator112-attempt";
import type { AssignmentDetail, OperatorAttempt } from "@/shared/api";
import { TimerBadge } from "@/shared/ui";

import styles from "./TrainerStrip.module.css";

export const EMERGENCY_AUDIO_NOTE = "Аварийный режим: аудио недоступно, показан текстовый транскрипт";
export const EXAM_REPLAY_NOTE = "Повторное прослушивание в экзамене запрещено";

const VOICE_TEXT: Partial<Record<ApplicantVoice["state"], string>> = {
  connecting: "Заявитель: соединение…",
  playing: "Заявитель на линии",
  unavailable: "Голос заявителя недоступен",
  ended: "Разговор завершён",
};

type TrainerStripProps = {
  assignment: AssignmentDetail;
  attempt: OperatorAttempt;
  norms: AttemptNorms;
  limitSec: number | null;
  nowMs: number;
  hintText: string | null;
  answerError: string | null;
  notice: string | null;
  /** Голос заявителя: только у принятого звонка; у СМС и до «Принять» — null. */
  voice: ApplicantVoice | null;
};

/**
 * Учебные показатели экрана 112 — только в полосе тренажёра над АРМ (спека 009, FR-002): норматив ответа, норматив
 * отработки, лимит экзамена, подсказка «делай как я», состояние голоса и текст аварийного режима. На самом экране АРМ их нет.
 */
export function TrainerStrip({
  assignment,
  attempt,
  norms,
  limitSec,
  nowMs,
  hintText,
  answerError,
  notice,
  voice,
}: TrainerStripProps) {
  const isRinging = attempt.state === "ringing";
  const wait = answerWait(attempt, norms.answerSec, nowMs);
  const processing = processingWait(attempt, norms.submitSec, nowMs);
  const remaining = examRemainingSec(attempt, limitSec, nowMs);
  const isExam = assignment.format === "exam";
  const emergency = voice?.trainerText.emergency ?? "";

  return (
    <div className={styles.strip} data-state={attempt.state}>
      <span className={styles.strip__title}>
        {assignment.title || "Задание"} · {isExam ? "экзамен" : "тренировка"}
      </span>
      {isRinging ? (
        <span className={styles.strip__timer}>
          <TimerBadge
            value={formatClock(wait.elapsedSec)}
            exceeded={wait.exceeded}
            caption="ожидание ответа"
          />
          <span data-exceeded={wait.exceeded}>
            {wait.exceeded
              ? `Норматив ответа ${norms.answerSec} с превышен`
              : `Норматив ответа — ${norms.answerSec} с`}
          </span>
        </span>
      ) : (
        <TimerBadge
          value={formatClock(processing.elapsedSec)}
          exceeded={processing.exceeded}
          caption={`отработка, норматив ${formatClock(norms.submitSec)}`}
        />
      )}
      {remaining !== null ? (
        <TimerBadge value={formatClock(remaining)} exceeded={remaining === 0} caption="лимит на билет" />
      ) : null}
      {hasAnswerTimeout(attempt) ? (
        <span className={styles.strip__flag} data-testid="answer-timeout">
          Ответ позже норматива {norms.answerSec} с
        </span>
      ) : null}
      {voice && VOICE_TEXT[voice.state] ? <span role="status">{VOICE_TEXT[voice.state]}</span> : null}
      {voice?.error ? <span role="alert">{voice.error}</span> : null}
      {isExam && !isRinging ? <span className={styles.strip__note}>{EXAM_REPLAY_NOTE}</span> : null}
      {emergency ? (
        <span className={styles.strip__transcript} data-testid="emergency-transcript">
          {EMERGENCY_AUDIO_NOTE}: {emergency}
        </span>
      ) : null}
      {hintText ? (
        <aside className={styles.strip__hint} aria-label="Подсказка" aria-live="polite">
          {hintText}
        </aside>
      ) : null}
      {notice ? <span role="status">{notice}</span> : null}
      {answerError ? <span role="alert">{answerError}</span> : null}
    </div>
  );
}
