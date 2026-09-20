import type { UsageStats as UsageStatsData } from "@/shared/api";
import { BarChart, LineChart } from "@/shared/ui";

import { CHART_TITLES } from "../config/monitoring";
import type { LoadState } from "../model/types";

import styles from "./MonitoringTab.module.css";

type UsageStatsProps = {
  state: LoadState<{ data: UsageStatsData }>;
};

/** «Статистика использования системы» (T4.2-14): входы по ролям, активность и объёмы карточек. */
export function UsageStats({ state }: UsageStatsProps) {
  if (state.status !== "ready") {
    return (
      <p className={styles.monitoring__state} role="status">
        {state.status === "loading" ? "Загрузка статистики…" : state.message}
      </p>
    );
  }
  const period = state.data.periods[0];
  if (!period) {
    return (
      <p className={styles.monitoring__state} role="status">
        За выбранный период данных нет
      </p>
    );
  }
  return (
    <div className={styles.monitoring__grid} data-period={period.id}>
      <BarChart
        title={`${CHART_TITLES.logins}: ${period.label}`}
        labels={period.loginsByRole.labels}
        values={period.loginsByRole.values}
      />
      <LineChart
        title={CHART_TITLES.activity}
        labels={period.activityByTime.labels}
        series={[{ name: "Пользователей в системе", values: period.activityByTime.values }]}
      />
      <LineChart
        title={CHART_TITLES.cards}
        labels={period.cards.labels}
        series={[
          { name: "Созданы", values: period.cards.created, tone: "blue" },
          { name: "Отработаны", values: period.cards.worked, tone: "orange" },
        ]}
      />
    </div>
  );
}
