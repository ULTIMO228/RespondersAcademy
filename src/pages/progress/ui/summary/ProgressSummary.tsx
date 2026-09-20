import type { ProgressSummaryData } from "@/entities/report";
import { formatDate, formatDuration } from "@/shared/lib";
import { Panel, TimerBadge } from "@/shared/ui";

import styles from "../ProgressPage.module.css";

type ProgressSummaryProps = {
  summary: ProgressSummaryData;
};

const EMPTY_VALUE = "—";

function formatAverage(valueMs: number | null): string {
  return valueMs === null ? EMPTY_VALUE : formatDuration(valueMs);
}

function formatPeriod({ periodFrom, periodTo }: ProgressSummaryData): string {
  if (!periodFrom || !periodTo) return EMPTY_VALUE;
  const from = formatDate(periodFrom);
  const to = formatDate(periodTo);
  return from === to ? from : `${from} – ${to}`;
}

/** Сводка: интегральный балл, средние против нормативов сценария, карточки, доля без ошибок (T2.5-02). */
export function ProgressSummary({ summary }: ProgressSummaryProps) {
  const { averageReactionMs, averageProcessingMs, norms } = summary;
  return (
    <Panel
      title="Сводка"
      headerTone="dark"
      actions={<span className={styles.progress__period}>Период: {formatPeriod(summary)}</span>}
    >
      <dl className={styles.summary}>
        <div className={styles.summary__item}>
          <dt>Интегральный балл за период</dt>
          <dd className={styles.summary__score}>{summary.integralScore ?? EMPTY_VALUE}</dd>
        </div>
        <div className={styles.summary__item}>
          <dt>Средняя реакция</dt>
          <dd>
            <TimerBadge
              value={formatAverage(averageReactionMs)}
              exceeded={(averageReactionMs ?? 0) > norms.reactionMs}
              caption={`против норматива ${formatDuration(norms.reactionMs)}`}
            />
          </dd>
        </div>
        <div className={styles.summary__item}>
          <dt>Средняя отработка</dt>
          <dd>
            <TimerBadge
              value={formatAverage(averageProcessingMs)}
              exceeded={(averageProcessingMs ?? 0) > norms.processingMs}
              caption={`против норматива ${formatDuration(norms.processingMs)}`}
            />
          </dd>
        </div>
        <div className={styles.summary__item}>
          <dt>Отработано карточек</dt>
          <dd className={styles.summary__value}>{summary.cardCount}</dd>
        </div>
        <div className={styles.summary__item}>
          <dt>Доля без ошибок</dt>
          <dd className={styles.summary__value}>
            {summary.errorFreePercent === null ? EMPTY_VALUE : `${summary.errorFreePercent} %`}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
