import type { CallView } from "../model/types";

import styles from "./ReportSession.module.css";

type AttemptCallsProps = {
  calls: CallView[];
};

/** Блок «Вызовы» попытки: номер точки C, длительность и транскрипт реплик (Q&A в16). */
export function AttemptCalls({ calls }: AttemptCallsProps) {
  if (calls.length === 0) {
    return <p className={styles.report__muted}>Вызовы по попытке не зафиксированы.</p>;
  }
  return (
    <section className={styles.report__calls} aria-label="Вызовы">
      <h4 className={styles.report__callsTitle}>Вызовы</h4>
      {calls.map((call) => (
        <article key={call.id} className={styles.report__call} data-call={call.toNumber}>
          <p className={styles.report__callHeader}>
            Номер <b className={styles.report__mono}>{call.toNumber}</b> · длительность{" "}
            <span className={styles.report__mono}>{call.duration}</span>
          </p>
          <ol className={styles.report__transcript}>
            {call.transcript.map((line) => (
              <li key={line.id}>
                <span className={styles.report__mono}>{line.at}</span> <b>{line.speakerTitle}:</b> {line.text}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </section>
  );
}
