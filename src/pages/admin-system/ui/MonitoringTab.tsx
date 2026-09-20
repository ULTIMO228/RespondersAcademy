"use client";

import { useState } from "react";

import type { UsageStatsPeriodId } from "@/shared/api";
import { LineChart, Panel, Select } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import { CHART_TITLES, DEFAULT_STAT_PERIOD, STAT_PERIOD_OPTIONS } from "../config/monitoring";
import { buildLoadCharts } from "../model/buildLoadCharts";
import { useMonitoring, useUsageStats } from "../model/useMonitoring";
import { ErrorReportButton } from "./ErrorReportButton";
import { UsageStats } from "./UsageStats";

import styles from "./MonitoringTab.module.css";

type MonitoringTabProps = {
  api?: SystemApi;
};

/** Секция 2 «Мониторинг нагрузки» + «Статистика использования системы» (T4.2-12…T4.2-14). */
export function MonitoringTab({ api }: MonitoringTabProps) {
  const [period, setPeriod] = useState<UsageStatsPeriodId>(DEFAULT_STAT_PERIOD);
  const monitoring = useMonitoring(api);
  const usage = useUsageStats(period, api);
  return (
    <div className={styles.monitoring}>
      <Panel
        title="Нагрузка на сервер (последние сутки)"
        headerTone="dark"
        actions={
          monitoring.status === "ready" ? <ErrorReportButton monitoring={monitoring.data} api={api} /> : null
        }
      >
        {monitoring.status === "ready" ? (
          <div className={styles.monitoring__grid}>
            {buildLoadCharts(monitoring.data, { ...CHART_TITLES }).map((chart) => (
              <div key={chart.id} className={styles.monitoring__chart} data-exceeded={chart.exceeded}>
                <LineChart
                  title={chart.title}
                  labels={monitoring.data.labels}
                  unit={chart.unit}
                  series={chart.series}
                  norms={chart.norms}
                />
                {chart.exceeded > 0 ? (
                  <p className={styles.monitoring__exceeded} role="status">
                    Превышение норматива: {chart.exceeded} точек ряда
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.monitoring__state} role="status">
            {monitoring.status === "loading" ? "Загрузка рядов мониторинга…" : monitoring.message}
          </p>
        )}
      </Panel>
      <Panel
        title="Статистика использования системы"
        headerTone="dark"
        actions={
          <Select
            tone="dark"
            aria-label="Период статистики"
            options={STAT_PERIOD_OPTIONS}
            value={period}
            onChange={(event) => setPeriod(event.target.value as UsageStatsPeriodId)}
          />
        }
      >
        <UsageStats state={usage} />
      </Panel>
    </div>
  );
}
