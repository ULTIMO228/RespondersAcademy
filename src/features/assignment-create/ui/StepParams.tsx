import { Alert, Field } from "@/shared/ui/platform";

import type { StepErrors, WizardDraft } from "../model/types";
import { CheckRow } from "./CheckRow";

import styles from "./AssignmentWizard.module.css";

type StepParamsProps = {
  draft: WizardDraft;
  errors: StepErrors;
  onChange: (patch: Partial<WizardDraft>) => void;
};

export function StepParams({ draft, errors, onChange }: StepParamsProps) {
  const isExam = draft.format === "exam";
  const setInterval = (index: number, value: string) =>
    onChange({
      workMessageIntervals: draft.workMessageIntervals.map((item, i) => (i === index ? value : item)),
    });
  return (
    <div className={styles.step}>
      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Нормативы</legend>
        <div className={styles.grid}>
          <Field
            label="Реакция на вызов, сек"
            inputMode="numeric"
            hint="Норматив ТЗ — 30 сек"
            value={draft.answerSec}
            error={errors.answerSec}
            onChange={(event) => onChange({ answerSec: event.target.value })}
          />
          <Field
            label="Полная отработка, сек"
            inputMode="numeric"
            hint="Норматив ТЗ — 3 мин (180 сек)"
            value={draft.submitSec}
            error={errors.submitSec}
            onChange={(event) => onChange({ submitSec: event.target.value })}
          />
        </div>
      </fieldset>

      {isExam ? (
        <fieldset className={styles.group}>
          <legend className={styles.group__title}>Экзамен</legend>
          <Alert tone="info">Подсказки в экзамене выключены.</Alert>
          <Field
            label="Порог сдачи, баллов из 100"
            inputMode="numeric"
            value={draft.passThreshold}
            error={errors.passThreshold}
            onChange={(event) => onChange({ passThreshold: event.target.value })}
          />
        </fieldset>
      ) : (
        <fieldset className={styles.group}>
          <legend className={styles.group__title}>Подсказки</legend>
          <CheckRow checked={draft.hintsEnabled} onChange={(checked) => onChange({ hintsEnabled: checked })}>
            Показывать подсказки обучающемуся
          </CheckRow>
          {draft.hintsEnabled ? (
            <Field
              label="Пауза до подсказки, сек"
              inputMode="numeric"
              value={draft.hintIdleSec}
              error={errors.hintIdleSec}
              onChange={(event) => onChange({ hintIdleSec: event.target.value })}
            />
          ) : null}
        </fieldset>
      )}

      <div className={styles.grid}>
        <Field
          label="Лимит времени на билет, сек"
          inputMode="numeric"
          hint="Необязательно. Считается на каждую попытку с момента поступления вызова"
          value={draft.timeLimitSec}
          error={errors.timeLimitSec}
          onChange={(event) => onChange({ timeLimitSec: event.target.value })}
        />
        <Field
          label="Срок выполнения"
          type="date"
          hint="Необязательно"
          value={draft.dueDate}
          onChange={(event) => onChange({ dueDate: event.target.value })}
        />
      </div>

      <fieldset className={styles.group}>
        <legend className={styles.group__title}>Сообщения служб</legend>
        <CheckRow
          checked={draft.workMessagesEnabled}
          onChange={(checked) => onChange({ workMessagesEnabled: checked })}
        >
          Присылать рабочие сообщения служб во время отработки
        </CheckRow>
        {draft.workMessagesEnabled ? (
          <>
            <div className={styles.grid}>
              {draft.workMessageIntervals.map((value, index) => (
                <Field
                  key={index}
                  label={`Сообщение ${index + 1}, сек от начала`}
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setInterval(index, event.target.value)}
                />
              ))}
            </div>
            {errors.workMessageIntervals ? (
              <Alert tone="danger" role="alert">
                {errors.workMessageIntervals}
              </Alert>
            ) : null}
          </>
        ) : null}
      </fieldset>
    </div>
  );
}
