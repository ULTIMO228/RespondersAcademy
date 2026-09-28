"use client";

import { CARD_SOURCE_TITLES, MODE_TITLES } from "@/entities/session";

import { getEligibleScenarios } from "../lib/eligibleScenarios";
import { getProfileWarnings } from "../lib/profileWarnings";
import type { SessionWizardApi } from "../model/deps";
import { defaultSessionWizardApi, SessionWizardApiContext } from "../model/deps";
import type { WizardData } from "../model/types";
import { useSessionStart } from "../model/useSessionStart";
import { useWizardData } from "../model/useWizardData";
import { useWizardState } from "../model/useWizardState";
import { StartBar } from "./StartBar";
import { StepCardSource } from "./StepCardSource";
import { StepCategories } from "./StepCategories";
import { StepFlow } from "./StepFlow";
import { StepGroup } from "./StepGroup";
import { StepMode } from "./StepMode";
import { StepScenarios } from "./StepScenarios";
import { StepTiming } from "./StepTiming";

import styles from "./SessionWizard.module.css";

type SessionWizardProps = {
  /** Преподаватель занятия — пользователь сессии (Session.teacherId). */
  teacherId: string;
  /** Подмена клиента мок-слоя (тесты). */
  api?: SessionWizardApi;
};

const START_REASONS = {
  students: "Выберите курсантов занятия",
  scenarios: "Выберите сценарии занятия",
  both: "Выберите курсантов и сценарии",
} as const;

function startReason(hasStudents: boolean, hasScenarios: boolean): string {
  if (!hasStudents && !hasScenarios) return START_REASONS.both;
  return hasStudents ? START_REASONS.scenarios : START_REASONS.students;
}

/** Форма мастера: 8 шагов секциями на одном экране (spec/000-фронт/04-pages/12-teacher-session.md). */
function WizardForm({ teacherId, data }: { teacherId: string; data: WizardData }) {
  const state = useWizardState(data);
  const { status, message, start } = useSessionStart(teacherId, state);
  const groupStudents = data.students.filter((student) => student.group === state.group);
  const selectedStudents = groupStudents.filter((student) => state.studentIds.includes(student.id));
  const eligible = getEligibleScenarios(data.scenarios, state.categories);
  const selectedScenarios = state.scenarioIds.filter((id) => eligible.some((scenario) => scenario.id === id));
  const canStart = selectedStudents.length > 0 && selectedScenarios.length > 0;
  const summary = `Курсантов: ${selectedStudents.length}, сценариев: ${selectedScenarios.length}, режим «${MODE_TITLES[state.mode]}», вопросы: ${CARD_SOURCE_TITLES[state.cardSource]}, нормативы ${state.reactionSec}/${state.processingSec} сек, темп ${state.paceSec} сек`;
  return (
    <div className={styles.wizard}>
      <div className={styles.wizard__column}>
        <StepGroup
          groups={data.groups}
          group={state.group}
          students={groupStudents}
          selectedIds={state.studentIds}
          onGroupChange={state.setGroup}
          onToggle={state.toggleStudent}
        />
        <StepCategories
          incidentGroups={data.incidentGroups}
          selected={state.categories}
          warnings={getProfileWarnings(selectedStudents, state.categories, data.profiles)}
          onToggle={state.toggleCategory}
        />
        <StepCardSource value={state.cardSource} pool={data.pool} onChange={state.setCardSource} />
      </div>
      <div className={styles.wizard__column}>
        <StepScenarios
          scenarios={data.scenarios}
          categories={state.categories}
          selectedIds={state.scenarioIds}
          order={state.order}
          onToggle={state.toggleScenario}
          onMove={state.moveScenario}
          onOrderChange={state.setOrder}
        />
        <StepMode
          mode={state.mode}
          hasHints={state.hasHints}
          scenarios={state.selectedScenarios}
          onModeChange={state.setMode}
          onHintsChange={state.setHasHints}
        />
        <StepTiming
          reactionSec={state.reactionSec}
          processingSec={state.processingSec}
          maxGrammarErrors={state.maxGrammarErrors}
          onReactionChange={state.setReactionSec}
          onProcessingChange={state.setProcessingSec}
          onGrammarChange={state.setMaxGrammarErrors}
        />
        <StepFlow
          paceSec={state.paceSec}
          isConveyor={state.isConveyor}
          onPaceChange={state.setPaceSec}
          onConveyorChange={state.setIsConveyor}
        />
        <StartBar
          canStart={canStart}
          summary={summary}
          reason={startReason(selectedStudents.length > 0, selectedScenarios.length > 0)}
          status={status}
          errorMessage={message}
          onStart={start}
        />
      </div>
    </div>
  );
}

/** Загрузка данных мастера из мок-слоя: состояния «загрузка» и «ошибка» — теми же токенами. */
function WizardLoader({ teacherId }: { teacherId: string }) {
  const { data, status } = useWizardData(teacherId);
  if (status === "error") {
    return (
      <p className={styles.wizard__reason} role="alert">
        Не удалось загрузить данные занятия
      </p>
    );
  }
  if (status === "loading" || !data) return <p className={styles.wizard__muted}>Загрузка данных занятия…</p>;
  return <WizardForm teacherId={teacherId} data={data} />;
}

/** Мастер занятия: данные и создание занятия — только через клиент мок-слоя (`@/shared/api`). */
export function SessionWizard({ teacherId, api = defaultSessionWizardApi }: SessionWizardProps) {
  return (
    <SessionWizardApiContext.Provider value={api}>
      <WizardLoader teacherId={teacherId} />
    </SessionWizardApiContext.Provider>
  );
}
