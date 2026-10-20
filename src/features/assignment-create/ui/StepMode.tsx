import { MODE_TITLES } from "@/entities/assignment";
import type { AssignableMode, AssignmentFormat, PublicUser } from "@/shared/api";
import { PROFILE_GENITIVE } from "@/shared/config";
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
  /** Выбранные курсанты, чей профиль режима не допускает выбранный режим (spec/008): в задание не попадут. */
  skipped?: PublicUser[];
  /** Ошибка шага: все выбранные несовместимы с режимом. */
  error?: string;
};

/** Цепочка 112 → ДДС выведена 20.10.2026 (spec/007 Clarifications): задания 112 и ДДС назначаются отдельно. */
const MODES: AssignableMode[] = ["operator112", "dds"];
const MODE_HINTS: Record<AssignableMode, string> = {
  operator112: "Обучающийся принимает вызов по аудиозаписи и заполняет карточку.",
  dds: "Обучающийся отрабатывает готовую карточку как диспетчер ДДС.",
};

/** «Иванов Сергей Петрович» → «Иванов С. П.» — как в серверном сообщении отказа. */
export function shortName(fullName: string): string {
  const [last, ...rest] = fullName.trim().split(/\s+/);
  return [last, ...rest.map((part) => `${part[0]}.`)].join(" ");
}

export function StepMode({
  title,
  trainingMode,
  format,
  onTitle,
  onMode,
  onFormat,
  skipped = [],
  error,
}: StepModeProps) {
  const profiles = [
    ...new Set(skipped.map((user) => user.trainingProfile).filter(Boolean)),
  ] as AssignableMode[];
  return (
    <div className={styles.step}>
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
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
      {skipped.length > 0 && !error ? (
        <Alert tone="warning">
          {`Пропущены (профиль ${profiles.map((profile) => PROFILE_GENITIVE[profile]).join(", ")}): ${skipped
            .map((user) => shortName(user.fullName))
            .join(", ")}`}
        </Alert>
      ) : null}
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
