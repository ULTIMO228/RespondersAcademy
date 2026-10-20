"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { ScenarioRunView } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Alert,
  Card,
  EmptyState,
  ErrorState,
  LinkButton,
  PageHeader,
  PlatformButton,
  ServerRequiredState,
  Skeleton,
} from "@/shared/ui/platform";

import { studentScenariosApi } from "../api/scenariosApi";
import type { StudentScenariosApi } from "../api/scenariosApi";
import { useScenarioRun } from "../model/useScenarioRun";
import { ScenarioResultCard } from "./ScenarioResultCard";

import styles from "./StudentScenarios.module.css";

type StudentScenarioRunScreenProps = {
  scenarioId: string;
  version: number;
  api?: StudentScenariosApi;
};

type StepViewProps = {
  run: ScenarioRunView;
  busy: boolean;
  onAct: (action: string, choice: string | null) => void;
  onAbort: () => void;
};

function StepView({ run, busy, onAct, onAbort }: StepViewProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const hintId = useId();
  const [choice, setChoice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const input = run.step?.input ?? null;
  const needsChoice = input !== null && choice === null;

  // Новый шаг — новый выбор, фокус на заголовок шага (скринридер читает его вместе с текстом).
  useEffect(() => {
    setChoice(null);
    headingRef.current?.focus();
  }, [run.runId, run.steps]);

  return (
    <Card>
      <h2 ref={headingRef} tabIndex={-1} className={styles.step__title}>
        {run.step?.title || `Шаг ${run.steps + 1}`}
      </h2>
      {run.step?.prompt ? <p className={styles.step__prompt}>{run.step.prompt}</p> : null}
      {input ? (
        <fieldset className={styles.choice}>
          <legend className={styles.choice__legend}>Выберите вариант</legend>
          {input.options.map((option) => (
            <label key={option.value} className={styles.choice__option}>
              <input
                type="radio"
                name={`choice-${run.runId}`}
                value={option.value}
                checked={choice === option.value}
                onChange={() => setChoice(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className={styles.actions} role="group" aria-label="Действия">
        {(run.actions ?? []).map((item) => (
          <PlatformButton
            key={item.action}
            variant="primary"
            disabled={busy || needsChoice}
            aria-describedby={needsChoice ? hintId : undefined}
            onClick={() => onAct(item.action, choice)}
          >
            {item.label}
          </PlatformButton>
        ))}
      </div>
      {needsChoice ? (
        <p id={hintId} className={styles.card__meta}>
          Сначала выберите вариант.
        </p>
      ) : null}
      {confirming ? (
        <div className={styles.confirm} role="alertdialog" aria-label="Подтверждение прерывания">
          <p>Прервать прохождение? Результат будет 0 баллов, продолжить этот прогон нельзя.</p>
          <div className={styles.actions}>
            <PlatformButton
              variant="primary"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                onAbort();
              }}
            >
              Да, прервать
            </PlatformButton>
            <PlatformButton onClick={() => setConfirming(false)}>Отмена</PlatformButton>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <PlatformButton variant="ghost" disabled={busy} onClick={() => setConfirming(true)}>
            Прервать прохождение
          </PlatformButton>
        </div>
      )}
    </Card>
  );
}

/** `/student/scenarios/[scenarioId]/[version]` — прохождение версии: шаг, действие или выбор, итог. */
export function StudentScenarioRunScreen({
  scenarioId,
  version,
  api = studentScenariosApi,
}: StudentScenarioRunScreenProps) {
  // Прогон не запускается, пока номер версии не проверен: хук живёт во внутреннем компоненте.
  if (!Number.isInteger(version) || version < 1) {
    return (
      <EmptyState
        title="Некорректная версия сценария"
        text="Откройте сценарий из списка назначенных."
        action={<LinkButton href={ROUTES.studentScenarios}>К списку сценариев</LinkButton>}
      />
    );
  }
  return <ScenarioRun scenarioId={scenarioId} version={version} api={api} />;
}

function ScenarioRun({ scenarioId, version, api }: Required<StudentScenarioRunScreenProps>) {
  const run = useScenarioRun({ scenarioId, version, api });
  const { state, notice } = run;

  return (
    <section aria-label="Прохождение сценария">
      <PageHeader title="Прохождение сценария" description={`Версия ${version}`} />
      {state.status === "loading" ? <Skeleton label="Запуск прохождения…" lines={3} /> : null}
      {state.status === "serverRequired" ? <ServerRequiredState onRetry={run.retry} /> : null}
      {state.status === "error" ? (
        <ErrorState title="Не удалось начать прохождение" message={state.message} onRetry={run.retry} />
      ) : null}
      {/* aria-live присутствует в DOM всегда: сообщения объявляются при появлении текста. */}
      <div aria-live="polite" role="status" className={styles.live}>
        {notice ? (
          <Alert tone={notice.kind === "other" ? "danger" : "warning"} role="status">
            {notice.text}
            {notice.note ? <span className={styles.live__note}> {notice.note}</span> : null}
          </Alert>
        ) : null}
      </div>
      {state.status === "ready" && state.run.status === "waiting" ? (
        <StepView run={state.run} busy={run.busy} onAct={run.perform} onAbort={run.abort} />
      ) : null}
      {state.status === "ready" && state.run.status !== "waiting" ? (
        <Card>
          <ScenarioResultCard status={state.run.status} result={state.run.result} onRestart={run.restart} />
        </Card>
      ) : null}
    </section>
  );
}
