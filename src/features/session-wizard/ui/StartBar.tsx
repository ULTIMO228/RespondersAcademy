"use client";

import type { StartStatus } from "../model/useSessionStart";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StartBarProps = {
  canStart: boolean;
  summary: string;
  /** Почему старт недоступен (нет курсантов / нет сценариев). */
  reason: string;
  status: StartStatus;
  errorMessage: string;
  onStart: () => void;
};

/** Шаг 8. «Начать занятие» → POST /sessions + start → /teacher; без выбора кнопка неактивна с пояснением. */
export function StartBar({ canStart, summary, reason, status, errorMessage, onStart }: StartBarProps) {
  const isBusy = status === "starting";
  return (
    <WizardStep index={8} title="Старт">
      <div className={styles.wizard__start}>
        <button
          type="button"
          className={styles.wizard__startButton}
          disabled={!canStart || isBusy}
          aria-describedby="wizard-start-reason"
          onClick={onStart}
        >
          {isBusy ? "Запуск занятия…" : "Начать занятие"}
        </button>
        <p id="wizard-start-reason" className={canStart ? styles.wizard__muted : styles.wizard__reason}>
          {canStart ? summary : reason}
        </p>
        {status === "error" ? (
          <p className={styles.wizard__reason} role="alert">
            {errorMessage}
          </p>
        ) : null}
      </div>
    </WizardStep>
  );
}
