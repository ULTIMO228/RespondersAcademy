import { BarChart, LineChart, Panel } from "@/shared/ui";

import type { ChartSeries } from "../../lib/selectStudentProgress";
import { ChartDataTable } from "./ChartDataTable";

import styles from "../ProgressPage.module.css";

type ProgressChartsProps = {
  scoreDynamics: ChartSeries;
  errorDistribution: ChartSeries;
};

const DYNAMICS_TITLE = "Динамика балла по попыткам (карточка №)";
const DISTRIBUTION_TITLE = "Распределение ошибок по типам";

/** Графики по ChartData своих отчётов (reports.json): динамика балла (line) и распределение ошибок (bar). */
export function ProgressCharts({ scoreDynamics, errorDistribution }: ProgressChartsProps) {
  return (
    <Panel title="Графики" headerTone="dark">
      <div className={styles.charts}>
        <div>
          {scoreDynamics.values.length === 0 ? (
            <p className={styles.progress__muted}>Динамика появится после первого отчёта занятия</p>
          ) : (
            <LineChart
              title={DYNAMICS_TITLE}
              labels={scoreDynamics.labels}
              series={[{ name: "Балл", values: scoreDynamics.values }]}
              unit="балл"
            />
          )}
          <ChartDataTable
            caption={DYNAMICS_TITLE}
            labelTitle="Карточка №"
            valueTitle="Балл"
            series={scoreDynamics}
          />
        </div>
        <div>
          {errorDistribution.values.every((value) => value === 0) ? (
            <p className={styles.progress__muted}>Ошибок пока не зафиксировано — распределение пустое</p>
          ) : null}
          <BarChart
            title={DISTRIBUTION_TITLE}
            labels={errorDistribution.labels}
            values={errorDistribution.values}
            unit="шт."
          />
          <ChartDataTable
            caption={DISTRIBUTION_TITLE}
            labelTitle="Тип ошибки"
            valueTitle="Количество"
            series={errorDistribution}
          />
        </div>
      </div>
    </Panel>
  );
}
