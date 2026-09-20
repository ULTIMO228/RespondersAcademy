import { STUDENT_STATE_TITLES } from "@/entities/session";
import { Select } from "@/shared/ui";

import type { WizardStudent } from "../model/types";
import { WizardStep } from "./WizardStep";

import styles from "./SessionWizard.module.css";

type StepGroupProps = {
  groups: string[];
  group: string;
  students: WizardStudent[];
  selectedIds: string[];
  onGroupChange: (group: string) => void;
  onToggle: (studentId: string) => void;
};

/** Шаг 1. Группа: чекбоксы курсантов (ФИО + № АРМ); не подключённый курсант — серая плитка. */
export function StepGroup({ groups, group, students, selectedIds, onGroupChange, onToggle }: StepGroupProps) {
  return (
    <WizardStep index={1} title="Группа" hint={`выбрано ${selectedIds.length} из ${students.length}`}>
      <Select
        label="Учебная группа"
        value={group}
        options={groups.map((item) => ({ value: item, label: item }))}
        onChange={(event) => onGroupChange(event.target.value)}
      />
      {students.length === 0 ? (
        <p className={styles.wizard__muted}>В группе нет курсантов</p>
      ) : (
        <ul className={styles.wizard__students}>
          {students.map((student) => (
            <li key={student.id}>
              <label
                className={[styles.wizard__check, student.isActive ? "" : styles["wizard__check--off"]].join(
                  " ",
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(student.id)}
                  disabled={!student.isActive}
                  onChange={() => onToggle(student.id)}
                />
                <span className={styles.wizard__arm}>АРМ {student.armNumber}</span>
                <span>{student.fullName}</span>
                {student.isActive ? null : (
                  <span className={styles.wizard__muted}>{STUDENT_STATE_TITLES.offline}</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}
    </WizardStep>
  );
}
