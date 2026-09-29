"use client";

import { Button } from "@/shared/ui";

import { useReportRecorder } from "../model/useReportRecorder";
import type { ReportApi } from "../model/useReportRecorder";
import type { AudioRecorder } from "@/shared/lib";

import styles from "./ReportRecorder.module.css";

type ReportRecorderProps = {
  attemptId: string;
  createRecorder?: (onAutoStop: () => void) => AudioRecorder;
  send?: ReportApi;
};

/** Голосовой доклад диспетчера: запись, отправка, распознанный текст и чек-лист из пяти пунктов с долей выполненных. */
export function ReportRecorder({ attemptId, createRecorder, send }: ReportRecorderProps) {
  const { state, start, stop, submit, reset } = useReportRecorder({ attemptId, createRecorder, send });
  const report = state.status === "done" ? state.result.call.report : undefined;
  const wav = state.status === "recorded" || (state.status === "error" && state.wav) ? state.wav : undefined;

  return (
    <section className={styles.report} aria-label="Голосовой доклад">
      <h3 className={styles.report__title}>Голосовой доклад</h3>
      <div className={styles.report__actions}>
        {state.status === "idle" || state.status === "done" || (state.status === "error" && !state.wav) ? (
          <Button size="sm" onClick={() => void start()}>
            {state.status === "done" ? "Записать ещё" : "Начать запись"}
          </Button>
        ) : null}
        {state.status === "recording" ? (
          <>
            <span className={styles.report__rec} role="status">
              ● Идёт запись (до 3 минут)
            </span>
            <Button size="sm" variant="danger" onClick={() => void stop()}>
              Остановить
            </Button>
          </>
        ) : null}
        {wav ? (
          <>
            <Button size="sm" variant="primary" onClick={() => void submit(wav)}>
              {state.status === "error" ? "Повторить отправку" : "Отправить"}
            </Button>
            <Button size="sm" onClick={reset}>
              Записать заново
            </Button>
          </>
        ) : null}
        {state.status === "sending" ? (
          <span role="status" className={styles.report__hint}>
            Распознаём…
          </span>
        ) : null}
      </div>
      {state.status === "error" ? (
        <p className={styles.report__error} role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <div className={styles.report__result}>
          {state.result.call.transcript.map((line, index) => (
            <p key={`${line.at}-${index}`} className={styles.report__text}>
              {line.text}
            </p>
          ))}
          {report ? (
            <>
              <p className={styles.report__score}>
                Чек-лист: {report.checks.filter((check) => check.found).length} из {report.checks.length}
              </p>
              <ul className={styles.report__checks} aria-label="Чек-лист доклада">
                {report.checks.map((check) => (
                  <li key={check.id} data-found={check.found}>
                    <span aria-hidden="true">{check.found ? "✓" : "✗"}</span> {check.label}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className={styles.report__hint}>Речь распознана, чек-лист не составлен</p>
          )}
        </div>
      ) : null}
    </section>
  );
}
