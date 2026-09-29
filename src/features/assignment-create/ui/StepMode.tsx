import { MODE_TITLES } from "@/entities/assignment";
import type { AssignmentFormat, TrainingMode } from "@/shared/api";
import { Alert, Field } from "@/shared/ui/platform";

import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StepModeProps = {
  title: string;
  trainingMode: TrainingMode;
  format: AssignmentFormat;
  onTitle: (value: string) => void;
  onMode: (mode: TrainingMode) => void;
  onFormat: (format: AssignmentFormat) => void;
};

const MODES: TrainingMode[] = ["operator112", "dds", "chain"];
const MODE_HINTS: Record<TrainingMode, string> = {
  operator112: "Обучающийся принимает вызов по аудиозаписи и заполняет карточку.",
  dds: "Обучающийся отрабатывает готовую карточку как диспетчер ДДС.",
  chain: "Этап A (приём вызова) → этап B (ДДС). Вход ДДС проверяет и подтверждает преподаватель.",
};

export function StepMode({ title, trainingMode, format, onTitle, onMode, onFormat }: StepModeProps) {
  return (
    <div className={styles.step}>
      <Field
        label="Название задания"
        hint="Необязательно: обучающийся увидит его в списке заданий"
        value={title}
        maxLength={120}
        onChange={(event) => onTitle(event.target.value)}
      />
      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Режим тренажёра</legend>
        {MODES.map((mode) => (
          <CheckRow key={mode} type="radio" checked={trainingMode === mode} onChange={() => onMode(mode)}>
            <strong>{MODE_TITLES[mode]}</strong>
            <span className={styles.check__meta}> — {MODE_HINTS[mode]}</span>
          </CheckRow>
        ))}
      </fieldset>
      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Формат</legend>
        <CheckRow type="radio" checked={format === "training"} onChange={() => onFormat("training")}>
          <strong>Тренировка</strong>
          <span className={styles.check__meta}> — подсказки доступны, результат не влияет на допуск</span>
        </CheckRow>
        <CheckRow type="radio" checked={format === "exam"} onChange={() => onFormat("exam")}>
          <strong>Экзамен</strong>
          <span className={styles.check__meta}> — без подсказок, есть порог сдачи и лимит времени</span>
        </CheckRow>
      </fieldset>
      {format === "exam" ? (
        <Alert tone="info">Подсказки в экзамене отключаются сервером и включить их нельзя.</Alert>
      ) : null}
    </div>
  );
}
