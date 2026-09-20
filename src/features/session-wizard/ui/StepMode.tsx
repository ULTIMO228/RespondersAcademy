import { MODE_TITLES } from "@/entities/session";
import type { SessionMode } from "@/entities/session";
import { Toggle } from "@/shared/ui";

import { MODE_HINTS } from "../config/wizard";
import type { WizardScenario } from "../model/types";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepModeProps = {
  mode: SessionMode;
  hasHints: boolean;
  /** Выбранные сценарии: если подсказок нет ни у одного — тумблер помечается пояснением. */
  scenarios: WizardScenario[];
  onModeChange: (mode: SessionMode) => void;
  onHintsChange: (hasHints: boolean) => void;
};

const MODES = Object.keys(MODE_TITLES) as SessionMode[];

/** Шаг 5. Режим: demo — показ / follow — делай как я / practice — самостоятельная + «Подсказки». */
export function StepMode({ mode, hasHints, scenarios, onModeChange, onHintsChange }: StepModeProps) {
  const withHints = scenarios.filter((scenario) => scenario.hintsEnabled);
  const hintsUnavailable = scenarios.length > 0 && withHints.length === 0;
  return (
    <WizardStep index={5} title="Режим">
      <div className={styles.wizard__radios} role="radiogroup" aria-label="Режим занятия">
        {MODES.map((item) => (
          <label key={item} className={styles.wizard__radio}>
            <input type="radio" name="mode" checked={mode === item} onChange={() => onModeChange(item)} />
            <span className={styles.wizard__radioTitle}>
              {item} — {MODE_TITLES[item]}
            </span>
            <span className={styles.wizard__muted}>{MODE_HINTS[item]}</span>
          </label>
        ))}
      </div>
      <Toggle
        label="Подсказки (для новичков, Scenario.hints)"
        checked={hasHints && !hintsUnavailable}
        disabled={hintsUnavailable}
        onChange={onHintsChange}
      />
      {hintsUnavailable ? (
        <p className={styles.wizard__muted}>
          У выбранных сценариев подсказки выключены (hints.enabled = false) — тумблер недоступен
        </p>
      ) : null}
    </WizardStep>
  );
}
