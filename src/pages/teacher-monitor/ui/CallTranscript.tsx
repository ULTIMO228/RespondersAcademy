import type { InternalNumber, PhoneCall } from "@/shared/api";
import { AiBadge, Panel } from "@/shared/ui";
import { formatDurationPadded, formatTime } from "@/shared/lib";

import styles from "./CallTranscript.module.css";

type CallTranscriptProps = {
  calls: PhoneCall[];
  internalNumbers: InternalNumber[];
};

const SPEAKER_TITLES = { dispatcher: "Курсант", ai: "Абонент" } as const;
const IN_PROGRESS = "идёт";

function describeNumber(numbers: InternalNumber[], toNumber: string): string {
  const found = numbers.find((entry) => entry.number === toNumber);
  return found ? `${toNumber} — ${found.title}` : toNumber;
}

function durationOf(call: PhoneCall): string {
  if (!call.endedAt) return IN_PROGRESS;
  return formatDurationPadded(Date.parse(call.endedAt) - Date.parse(call.startedAt));
}

/** Транскрипт вызовов точки C из CardEvent.calls (Q&A в16): номер, длительность, реплики. */
export function CallTranscript({ calls, internalNumbers }: CallTranscriptProps) {
  return (
    <Panel title="Вызовы точки C" headerTone="dark">
      {calls.length === 0 ? (
        <p className={styles.calls__empty}>Вызовов по текущей карточке пока нет</p>
      ) : (
        <ol className={styles.calls}>
          {calls.map((call) => (
            <li key={`${call.toNumber}-${call.startedAt}`} className={styles.calls__item}>
              <p className={styles.calls__head}>
                <b>{describeNumber(internalNumbers, call.toNumber)}</b>
                <span className={styles.calls__meta}>
                  {formatTime(call.startedAt)} · {durationOf(call)}
                </span>
              </p>
              <ol className={styles.calls__lines}>
                {call.transcript.map((line) => (
                  <li
                    key={`${line.at}-${line.text}`}
                    className={styles.calls__line}
                    data-speaker={line.speaker}
                  >
                    <span className={styles.calls__speaker}>
                      {SPEAKER_TITLES[line.speaker]}
                      {line.speaker === "ai" ? <AiBadge title="Реплика ИИ-абонента точки C (мок)" /> : null}
                    </span>
                    <span>{line.text}</span>
                  </li>
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
