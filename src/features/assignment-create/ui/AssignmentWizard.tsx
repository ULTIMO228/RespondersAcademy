"use client";

import { useState } from "react";

import type { Assignment, PublicUser } from "@/shared/api";
import { Alert, Card, PlatformButton, Stepper } from "@/shared/ui/platform";

import { assignmentCreateApi } from "../api/assignmentCreateApi";
import type { AssignmentCreateApi } from "../api/assignmentCreateApi";
import { assignableStudents } from "../model/students";
import { WIZARD_STEPS, createDraft } from "../model/types";
import type { StepErrors, WizardDraft, WizardInitial } from "../model/types";
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
  /** Начальные значения из карты ошибок; обучающихся мастер берёт только из списка доступных. */
  initial?: WizardInitial;
  /** Название этапа карты ошибок для подсказки на шаге билетов. */
  focusStage?: string;
  onCreated: (assignment: Assignment) => void;
  onCancel: () => void;
};

const REVIEW_STEP = WIZARD_STEPS.length - 1;
const FIRST_ERROR_STEP: Record<string, number> = {
  studentIds: 1,
  cardIds: 2,
  studentCards: 2,
  ruleCount: 2,
};

/**
 * Мастер назначения: режим и формат → обучающиеся с нужной специализацией → билеты → параметры → проверка и
 * создание. Каждый шаг проверяется перед переходом вперёд; отказ сервера (400/403/409) показывается дословно на
 * последнем шаге, введённое сохраняется.
 */
export function AssignmentWizard({
  api = assignmentCreateApi,
  assignedGroups,
  initial,
  focusStage,
  onCreated,
  onCancel,
}: AssignmentWizardProps) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>(() => createDraft(initial));
  const [errors, setErrors] = useState<StepErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [students, setStudents] = useState<PublicUser[]>([]);
  /** Список обучающихся загружен хотя бы раз: до этого предвыбор из ссылки не проверен и «Далее» недоступна. */
  const [studentsLoaded, setStudentsLoaded] = useState(false);
  /** Сколько предвыбранных из ссылки обучающихся недоступны; считается при каждой загрузке, не уменьшается после снятия. */
  const [unavailableInitial, setUnavailableInitial] = useState(0);

  const handleStudentsLoaded = (loaded: PublicUser[]) => {
    const available = new Set(
      assignableStudents(loaded, assignedGroups, draft.trainingMode).map((user) => user.id),
    );
    setStudents(loaded);
    setStudentsLoaded(true);
    setUnavailableInitial((initial?.studentIds ?? []).filter((id) => !available.has(id)).length);
    // Пересечение, а не замена: снятый вручную обучающийся не возвращается при повторной загрузке шага.
    setDraft((current) => ({
      ...current,
      studentIds: current.studentIds.filter((id) => available.has(id)),
    }));
  };

  const patch = (change: Partial<WizardDraft>) => {
    setDraft((current) => ({ ...current, ...change }));
    setErrors({});
    setServerError(null);
  };

  const changeMode = (trainingMode: WizardDraft["trainingMode"]) => {
    const available = new Set(
      assignableStudents(students, assignedGroups, trainingMode).map((user) => user.id),
    );
    // Выбор обучающихся и билетов зависит от режима: снимаем неподходящих и сбрасываем выбор билетов.
    patch({
      trainingMode,
      studentIds: draft.studentIds.filter((id) => available.has(id)),
      ticketSource: "cards",
      cardIds: [],
      studentCards: [],
    });
  };

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
          <StepMode
            title={draft.title}
            trainingMode={draft.trainingMode}
            format={draft.format}
            onTitle={(title) => patch({ title })}
            onMode={changeMode}
            onFormat={(format) => patch({ format })}
          />
        ) : null}
        {step === 1 ? (
          <>
            {unavailableInitial > 0 ? (
              <Alert tone="warning">
                {`Из карты ошибок предвыбраны недоступные обучающиеся, они не выбраны: ${unavailableInitial}`}
              </Alert>
            ) : null}
            <StepStudents
              api={api}
              assignedGroups={assignedGroups}
              trainingMode={draft.trainingMode}
              selected={draft.studentIds}
              errors={errors}
              onChange={(studentIds) => patch({ studentIds })}
              onLoaded={handleStudentsLoaded}
            />
          </>
        ) : null}
        {step === 2 ? (
          <StepTickets api={api} draft={draft} errors={errors} onChange={patch} focusStage={focusStage} />
        ) : null}
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
            <PlatformButton variant="primary" onClick={next} disabled={step === 1 && !studentsLoaded}>
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
