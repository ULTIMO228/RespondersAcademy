import { Chip } from "@/shared/ui";

import type { ProfileWarning } from "../model/types";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepCategoriesProps = {
  incidentGroups: string[];
  selected: string[];
  warnings: ProfileWarning[];
  onToggle: (group: string) => void;
};

/** Шаг 2. Категории событий: множественный выбор групп ЕКП + предупреждение о профиле группы. */
export function StepCategories({ incidentGroups, selected, warnings, onToggle }: StepCategoriesProps) {
  return (
    <WizardStep index={2} title="Категории событий" hint={`группы ЕКП · выбрано ${selected.length}`}>
      <div className={styles.wizard__chips}>
        {selected.map((group) => (
          <Chip
            key={group}
            selected
            className={styles.wizard__chip}
            onClick={() => onToggle(group)}
            title="Снять"
          >
            {group}
          </Chip>
        ))}
      </div>
      <ul className={styles.wizard__groups} aria-label="Группы происшествий ЕКП">
        {incidentGroups.map((group) => (
          <li key={group}>
            <label className={styles.wizard__check}>
              <input type="checkbox" checked={selected.includes(group)} onChange={() => onToggle(group)} />
              <span>{group}</span>
            </label>
          </li>
        ))}
      </ul>
      {warnings.length > 0 ? (
        <div className={styles.wizard__warning} role="alert">
          <b>Категории не пересекаются с профилем части группы:</b>
          <ul>
            {warnings.map((warning) => (
              <li key={warning.studentId}>{warning.text}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </WizardStep>
  );
}
