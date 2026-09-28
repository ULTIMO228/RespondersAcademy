import type { ReactNode } from "react";

import styles from "./SessionWizard.module.css";

type WizardStepProps = {
  index: number;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
};

/** Секция мастера с номером шага (все шаги на одном экране, spec/000-фронт/04-pages/12). */
export function WizardStep({ index, title, hint, children }: WizardStepProps) {
  return (
    <section className={styles.wizard__step} aria-labelledby={`wizard-step-${index}`}>
      <header className={styles.wizard__stepHeader}>
        <span className={styles.wizard__stepIndex}>{index}</span>
        <h2 id={`wizard-step-${index}`} className={styles.wizard__stepTitle}>
          {title}
        </h2>
        {hint ? <span className={styles.wizard__stepHint}>{hint}</span> : null}
      </header>
      <div className={styles.wizard__stepBody}>{children}</div>
    </section>
  );
}
