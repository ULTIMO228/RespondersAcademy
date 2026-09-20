import styles from "./IncidentPage.module.css";

type HintBarProps = {
  hint: { step: number; total: number; text: string } | null;
};

/** Плашка-подсказка новичку (hint-режим, Q&A в4): текст текущего шага из Scenario.hints. */
export function HintBar({ hint }: HintBarProps) {
  if (!hint) return null;
  return (
    <aside className={styles.page__hint} aria-label="Подсказка" aria-live="polite">
      <span className={styles["page__hint-step"]}>
        Подсказка {hint.step + 1} из {hint.total}
      </span>
      {hint.text}
    </aside>
  );
}
