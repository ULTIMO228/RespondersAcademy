import type { ScenarioRunResult, ScenarioRunStatus } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDurationPadded } from "@/shared/lib";
import { Alert, LinkButton, PlatformButton } from "@/shared/ui/platform";

import { ResultBadge } from "./ResultBadge";

import styles from "./StudentScenarios.module.css";

type ScenarioResultCardProps = {
  status: ScenarioRunStatus;
  result: ScenarioRunResult | undefined;
  onRestart: () => void;
};

const STATUS_NOTE: Partial<Record<ScenarioRunStatus, string>> = {
  aborted: "Прохождение прервано: результат — 0 баллов.",
  faulted: "Прохождение остановлено защитой от зацикливания: результат — 0 баллов.",
};

/** Итог прохождения: балл из 100, зачёт, исход, неверные действия, шаги, время. */
export function ScenarioResultCard({ status, result, onRestart }: ScenarioResultCardProps) {
  return (
    <div className={styles.result}>
      {STATUS_NOTE[status] ? <Alert tone="warning">{STATUS_NOTE[status]}</Alert> : null}
      {result ? (
        <>
          <p className={styles.result__score}>
            <strong>{result.score}</strong> из 100 <ResultBadge passed={result.passed} />
          </p>
          <p className={styles.result__outcome}>{result.outcomeTitle || result.outcome}</p>
          <dl className={styles.card__terms}>
            <div>
              <dt>Неверных действий</dt>
              <dd>{result.wrongAttempts}</dd>
            </div>
            <div>
              <dt>Шагов</dt>
              <dd>{result.steps}</dd>
            </div>
            <div>
              <dt>Время</dt>
              <dd>{formatDurationPadded(result.durationMs)}</dd>
            </div>
          </dl>
        </>
      ) : (
        <p className={styles.card__meta}>Результат пока недоступен.</p>
      )}
      <div className={styles.actions}>
        <LinkButton href={ROUTES.studentScenarios}>К списку сценариев</LinkButton>
        <PlatformButton variant="primary" onClick={onRestart}>
          Пройти ещё раз
        </PlatformButton>
      </div>
    </div>
  );
}
