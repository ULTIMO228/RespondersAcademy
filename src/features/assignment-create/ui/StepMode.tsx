import { MODE_TITLES } from "@/entities/assignment";
import type { AssignableMode, AssignmentFormat } from "@/shared/api";
import { Alert, Field } from "@/shared/ui/platform";

import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StepModeProps = {
  title: string;
  trainingMode: AssignableMode;
  format: AssignmentFormat;
  onTitle: (value: string) => void;
  onMode: (mode: AssignableMode) => void;
  onFormat: (format: AssignmentFormat) => void;
};

/** Цепочка 112 → ДДС выведена 20.10.2026 (spec/007 Clarifications): задания 112 и ДДС назначаются отдельно. */
const MODES: AssignableMode[] = ["operator112", "dds"];
const MODE_HINTS: Record<AssignableMode, string> = {
  operator112: "Обучающийся принимает вызов по аудиозаписи и заполняет карточку.",
  dds: "Обучающийся отрабатывает готовую карточку как диспетчер ДДС.",
};

/**
 * Режим выбирается до обучающихся: шаг «Обучающиеся» показывает только тех, у кого есть специализация режима
 * (спека 007), поэтому профильный отсев spec/008 здесь не нужен.
 */
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
