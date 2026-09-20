import { describe, expect, it } from "vitest";

import type { SystemMonitoring } from "@/shared/api";

import { CHART_TITLES } from "../config/monitoring";
import { buildLoadCharts, describeLoadPeaks } from "./buildLoadCharts";

const monitoring: SystemMonitoring = {
  generatedAt: "2026-09-17T12:00:00+03:00",
  windowHours: 24,
  stepMinutes: 60,
  labels: ["11:00", "12:00"],
  series: {
    cpuPercent: [63, 59],
    memoryPercent: [56, 54],
    networkMbit: [31, 27],
    activeSessions: [26, 18],
    responseSec: [2.4, 1.2],
  },
  norms: { sessionLimit: 20, responseSec: 2 },
};

describe("маппинг monitoring.json → props чартов", () => {
  it("4 графика, линии нормативов только у сессий и отклика", () => {
    const charts = buildLoadCharts(monitoring, { ...CHART_TITLES });
    expect(charts.map((chart) => chart.id)).toEqual(["cpuMemory", "network", "sessions", "response"]);
    expect(charts[0].norms).toEqual([]);
    expect(charts[2].norms[0]).toMatchObject({ value: 20 });
    expect(charts[3].norms[0]).toMatchObject({ value: 2 });
  });

  it("считает точки выше норматива — для подсветки превышения", () => {
    const charts = buildLoadCharts(monitoring, { ...CHART_TITLES });
    expect(charts[2].exceeded).toBe(1);
    expect(charts[3].exceeded).toBe(1);
  });

  it("ряды уходят в чарт без изменений (объективность диаграмм, ТЗ §17)", () => {
    const charts = buildLoadCharts(monitoring, { ...CHART_TITLES });
    expect(charts[0].series[0].values).toEqual(monitoring.series.cpuPercent);
    expect(charts[2].series[0].values).toEqual(monitoring.series.activeSessions);
  });

  it("сводка пиков для отчёта об ошибках", () => {
    const lines = describeLoadPeaks(monitoring);
    expect(lines[0]).toContain("26");
    expect(lines[1]).toContain("1");
  });
});
