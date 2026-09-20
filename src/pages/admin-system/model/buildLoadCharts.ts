import type { LineSeries } from "@/shared/ui";
import type { SystemMonitoring } from "@/shared/api";

import { RESPONSE_NORM_LABEL, SESSIONS_NORM_LABEL } from "../config/monitoring";

export type LoadChart = {
  id: string;
  title: string;
  unit?: string;
  series: LineSeries[];
  norms: { value: number; label: string }[];
  /** Число точек выше норматива — подсветка превышения рядом с графиком. */
  exceeded: number;
};

const count = (values: number[], limit: number) => values.filter((value) => value > limit).length;

/**
 * `monitoring.json` → props графиков (T4.2-12). Масштаб осей не подгоняется: ряды уходят в чарт
 * как есть, нормативы рисуются отдельными линиями (объективность диаграмм, ТЗ §17).
 */
export function buildLoadCharts(monitoring: SystemMonitoring, titles: Record<string, string>): LoadChart[] {
  const { series, norms } = monitoring;
  return [
    {
      id: "cpuMemory",
      title: titles.cpuMemory,
      unit: "%",
      series: [
        { name: "CPU", values: series.cpuPercent, tone: "blue" },
        { name: "Память", values: series.memoryPercent, tone: "orange" },
      ],
      norms: [],
      exceeded: 0,
    },
    {
      id: "network",
      title: titles.network,
      unit: "Мбит/с",
      series: [{ name: "Сеть", values: series.networkMbit }],
      norms: [],
      exceeded: 0,
    },
    {
      id: "sessions",
      title: titles.sessions,
      series: [{ name: "Сессии", values: series.activeSessions }],
      norms: [{ value: norms.sessionLimit, label: SESSIONS_NORM_LABEL }],
      exceeded: count(series.activeSessions, norms.sessionLimit),
    },
    {
      id: "response",
      title: titles.response,
      unit: "с",
      series: [{ name: "Отклик", values: series.responseSec, tone: "gray" }],
      norms: [{ value: norms.responseSec, label: RESPONSE_NORM_LABEL }],
      exceeded: count(series.responseSec, norms.responseSec),
    },
  ];
}

/** Строки мок-отчёта об ошибках и сбоях (T4.2-13) — сводка по рядам мониторинга. */
export function describeLoadPeaks(monitoring: SystemMonitoring): string[] {
  const { series, norms } = monitoring;
  return [
    `Пик одновременных сессий: ${Math.max(...series.activeSessions)} (норматив ≥ ${norms.sessionLimit})`,
    `Превышений отклика > ${norms.responseSec} с: ${count(series.responseSec, norms.responseSec)}`,
    `Пик загрузки CPU: ${Math.max(...series.cpuPercent)} %, памяти: ${Math.max(...series.memoryPercent)} %`,
  ];
}
