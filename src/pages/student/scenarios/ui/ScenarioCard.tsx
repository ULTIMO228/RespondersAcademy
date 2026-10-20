import type { AssignedScenario } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate, formatDurationPadded } from "@/shared/lib";
import { LinkButton } from "@/shared/ui/platform";

import { ResultBadge } from "./ResultBadge";

import styles from "./StudentScenarios.module.css";

const MODE_TITLES: Record<AssignedScenario["mode"], string> = { operator112: "Режим 112", dds: "Режим ДДС" };

function actionTitle(item: AssignedScenario): string {
  if (item.activeRunId) return "Продолжить";
  return item.attempts > 0 ? "Пройти ещё раз" : "Начать";
}

/** Карточка назначенного сценария: задание, попытки, последний результат, запуск/продолжение. */
export function ScenarioCard({ item }: { item: AssignedScenario }) {
  const last = item.lastResult;
  return (
    <article className={styles.card} aria-label={item.title}>
      <header>
        <h2 className={styles.card__title}>{item.title}</h2>
        <p className={styles.card__meta}>
          Задание: {item.assignmentTitle} · {MODE_TITLES[item.mode]} · версия {item.version}
        </p>
      </header>
      <dl className={styles.card__terms}>
        <div>
          <dt>Попыток</dt>
          <dd>{item.attempts}</dd>
        </div>
        {item.dueAt ? (
          <div>
            <dt>Срок</dt>
            <dd>{formatDate(item.dueAt)}</dd>
          </div>
        ) : null}
        {item.activeRunId ? (
          <div>
            <dt>Состояние</dt>
            <dd>Прохождение не завершено</dd>
          </div>
        ) : null}
      </dl>
      {last ? (
        <p className={styles.card__last}>
          Последний результат: <ResultBadge passed={last.passed} /> <strong>{last.score}</strong> из 100 ·{" "}
          {formatDurationPadded(last.durationMs)}
        </p>
      ) : (
        <p className={styles.card__meta}>Результатов пока нет.</p>
      )}
      <footer className={styles.card__actions}>
        <LinkButton variant="primary" href={ROUTES.studentScenarioRun(item.scenarioId, item.version)}>
          {actionTitle(item)}
        </LinkButton>
      </footer>
    </article>
  );
}
