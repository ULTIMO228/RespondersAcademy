"use client";

import { useState } from "react";

import type { Assignment, PublicUser } from "@/shared/api";
import { Card, PlatformButton, Stepper } from "@/shared/ui/platform";

import { assignmentCreateApi } from "../api/assignmentCreateApi";
import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import { WIZARD_STEPS, createDraft } from "../model/types";
import type { StepErrors, WizardDraft } from "../model/types";
import { buildRequest, validateAll, validateStep } from "../model/validate";
import { StepMode } from "./StepMode";
import { StepParams } from "./StepParams";
import { StepReview } from "./StepReview";
import { StepStudents } from "./StepStudents";
import { StepTickets } from "./StepTickets";

import styles from "./AssignmentWizard.module.css";

type AssignmentWizardProps = {
  api?: AssignmentCreateApi;
  /** Закреплённые за преподавателем группы (профиль сессии). */
  assignedGroups?: string[];
  onCreated: (assignment: Assignment) => void;
  onCancel: () => void;
};

const REVIEW_STEP = WIZARD_STEPS.length - 1;
const FIRST_ERROR_STEP: Record<string, number> = {
  studentIds: 0,
  cardIds: 2,
  ruleCount: 2,
};

/**
 * Мастер назначения: обучающиеся → режим и формат → билеты → параметры → проверка и создание. Каждый шаг проверяется
 * перед переходом вперёд; отказ сервера (400/403/409) показывается дословно на последнем шаге, введённое сохраняется.
 */
export function AssignmentWizard({
  api = assignmentCreateApi,
  assignedGroups,
  onCreated,
  onCancel,
}: AssignmentWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(createDraft);
  const [errors, setErrors] = useState<StepErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<PublicUser[]>([]);

  const patch = (change: Partial<WizardDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setErrors({});
    setServerError(null);
  };

  const changeMode = (trainingMode: WizardDraft["trainingMode"]) =>
    // Источник билетов и выбранные версии зависят от режима: смена режима сбрасывает выбор билетов.
    patch({ trainingMode, ticketSource: "cards", cardIds: [], scenarioVersions: [] });

  const next = () => {
    const found = validateStep(step, draft);
    if (Object.keys(found).length > 0) {
      setErrors(found);
      return;
    }
    setStep(step + 1);
  };

  const submit = async () => {
    const found = validateAll(draft);
    const failed = Object.keys(found);
    if (failed.length > 0) {
      setErrors(found);
      setStep(FIRST_ERROR_STEP[failed[0]] ?? 3);
      return;
    }
    setSubmitting(true);
    setServerError(null);
    try {
      onCreated(await api.create(buildRequest(draft)));
    } catch (error) {
      setServerError(error instanceof Error && error.message ? error.message : "Не удалось создать задание");
    }
    setSubmitting(false);
  };

  const studentNames = draft.studentIds.map(
    (id) => students.find((student) => student.id === id)?.fullName ?? id,
  );

  return (
    <div className={styles.wizard}>
      <Stepper steps={[...WIZARD_STEPS]} current={step} />
      <Card title={WIZARD_STEPS[step]} aria-label={`Шаг ${step + 1}: ${WIZARD_STEPS[step]}`}>
        {step === 0 ? (
          <StepStudents
            api={api}
            assignedGroups={assignedGroups}
            selected={draft.studentIds}
            errors={errors}
            onChange={(studentIds) => patch({ studentIds })}
            onLoaded={setStudents}
          />
        ) : null}
        {step === 1 ? (
          <StepMode
            title={draft.title}
            trainingMode={draft.trainingMode}
            format={draft.format}
            onTitle={(title) => patch({ title })}
            onMode={changeMode}
            onFormat={(format) => patch({ format })}
          />
        ) : null}
        {step === 2 ? <StepTickets api={api} draft={draft} errors={errors} onChange={patch} /> : null}
        {step === 3 ? <StepParams draft={draft} errors={errors} onChange={patch} /> : null}
        {step === REVIEW_STEP ? (
          <StepReview draft={draft} studentNames={studentNames} serverError={serverError} />
        ) : null}
      </Card>
      <div className={styles.wizard__bar}>
        <PlatformButton variant="ghost" onClick={onCancel} disabled={isSubmitting}>
          Отмена
        </PlatformButton>
        <div className={styles.wizard__nav}>
          <PlatformButton
            variant="secondary"
            onClick={() => setStep(step - 1)}
            disabled={step === 0 || isSubmitting}
          >
            Назад
          </PlatformButton>
          {step < REVIEW_STEP ? (
            <PlatformButton variant="primary" onClick={next}>
              Далее
            </PlatformButton>
          ) : (
            <PlatformButton variant="primary" onClick={() => void submit()} disabled={isSubmitting}>
              {isSubmitting ? "Создание…" : "Создать задание"}
            </PlatformButton>
          )}
        </div>
      </div>
    </div>
  );
}
