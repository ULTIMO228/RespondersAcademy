"use client";

import { Fragment, useState } from "react";

import type { ScenarioRunListItem, ScenarioRunStatus } from "@/shared/api";
import { formatDurationPadded } from "@/shared/lib";
import { EmptyState, ResourceView, useResource } from "@/shared/ui/platform";

import type { ScenarioGraphEditorApi } from "../api/graphEditorApi";
import { Btn } from "./controls";

import styles from "./Runs.module.css";

const STATUS_LABEL: Record<ScenarioRunStatus, string> = {
  waiting: "В процессе",
  completed: "Завершено",
  aborted: "Прервано",
  faulted: "Остановлено защитой",
};

type RunsSectionProps = {
  scenarioId: string;
  api: Pick<ScenarioGraphEditorApi, "listScenarioRuns">;
};

function RunRow({ run }: { run: ScenarioRunListItem }) {
  const [open, setOpen] = useState(false);
  const result = run.result;
  const detailsId = `run-details-${run.runId}`;
  return (
    <Fragment>
      <tr>
        <td>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? "▾" : "▸"} {run.studentId}
          </button>
        </td>
        <td>{run.version}</td>
        <td>{STATUS_LABEL[run.status]}</td>
        <td>{result ? result.score : "—"}</td>
        <td>{result ? (result.passed ? "✓ Зачтено" : "✗ Не зачтено") : "—"}</td>
        <td>{result ? result.wrongAttempts : "—"}</td>
        <td>{result ? formatDurationPadded(result.durationMs) : "—"}</td>
      </tr>
      {open ? (
        <tr id={detailsId} className={styles.details}>
          <td colSpan={7}>
            {result ? (
              <dl className={styles.details__list}>
                <div>
                  <dt>Итог</dt>
                  <dd>{result.outcomeTitle || result.outcome}</dd>
                </div>
                <div>
                  <dt>Маршрут</dt>
                  <dd>{result.path.length > 0 ? result.path.join(" → ") : "—"}</dd>
                </div>
                <div>
                  <dt>Выбранные ветки</dt>
                  <dd>{result.branches.length > 0 ? result.branches.join(", ") : "—"}</dd>
                </div>
              </dl>
            ) : (
              <p className={styles.muted}>Прохождение не завершено: маршрута пока нет.</p>
            )}
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

/** Раздел «Прохождения»: прогоны обучающихся по сценарию; строка раскрывается до маршрута и выбранных веток. */
export function RunsSection({ scenarioId, api }: RunsSectionProps) {
  const { state, reload } = useResource(
    (signal) => api.listScenarioRuns({ scenarioId }, signal),
    [api, scenarioId],
  );
  return (
    <section className={styles.root} aria-label="Прохождения">
      <div className={styles.head}>
        <h3 className={styles.title}>Прохождения</h3>
        <Btn onClick={reload} disabled={state.status === "loading"}>
          Обновить
        </Btn>
      </div>
      <ResourceView state={state} onRetry={reload} errorTitle="Не удалось загрузить прохождения">
        {(runs) =>
          runs.length === 0 ? (
            <EmptyState
              title="Прохождений пока нет"
              text="Результаты появятся, когда обучающиеся пройдут опубликованные версии сценария."
            />
          ) : (
            <div className={styles.scroll}>
              <table className={styles.table}>
                <caption className="visually-hidden">Прохождения сценария обучающимися</caption>
                <thead>
                  <tr>
                    <th scope="col">Обучающийся</th>
                    <th scope="col">Версия</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Балл</th>
                    <th scope="col">Зачёт</th>
                    <th scope="col">Неверных</th>
                    <th scope="col">Время</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <RunRow key={run.runId} run={run} />
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </ResourceView>
    </section>
  );
}
