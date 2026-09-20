import { formatTime } from "@/shared/lib";
import { AiBadge } from "@/shared/ui";

import type { TranscriptLine } from "../model/types";

import styles from "./CallTranscript.module.css";

type CallTranscriptProps = {
  number: string;
  lines: readonly TranscriptLine[];
  voiceNote: string;
  emptyText: string;
};

const AI_REPLY_TITLE = "Реплика сгенерирована ИИ-абонентом (мок), голос эмулируется текстом";

/** Лог реплик вызова в виде чата транскрипции: ИИ-абонент слева с бейджем «ИИ», диспетчер справа. */
export function CallTranscript({ number, lines, voiceNote, emptyText }: CallTranscriptProps) {
  return (
    <div className={styles.transcript}>
      <p className={styles.transcript__voice}>
        <AiBadge title={AI_REPLY_TITLE} /> {voiceNote}
      </p>
      <ol className={styles.transcript__log} role="log" aria-label="Транскрипт вызова" aria-live="polite">
        {lines.length === 0 ? <li className={styles.transcript__empty}>{emptyText}</li> : null}
        {lines.map((line, index) => (
          <li
            key={`${line.speaker}-${index}`}
            className={[styles.transcript__line, styles[`transcript__line--${line.speaker}`]].join(" ")}
            data-speaker={line.speaker}
          >
            <span className={styles.transcript__meta}>
              {line.speaker === "ai" ? (
                <>
                  <span>Абонент {number}</span>
                  <AiBadge title={AI_REPLY_TITLE} />
                </>
              ) : (
                <span>Диспетчер</span>
              )}
              <time className={styles.transcript__time} dateTime={line.at}>
                {formatTime(line.at)}
              </time>
            </span>
            <span className={styles.transcript__text}>{line.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
