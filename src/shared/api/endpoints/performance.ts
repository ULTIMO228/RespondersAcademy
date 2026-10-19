/* Сводная успеваемость — /api/v1/performance/* (спека 005, contracts/performance-endpoints.md). Только с бэкендом. */
import { buildQuery } from "../client";
import { v1ApiBaseUrl, v1ApiClient } from "../v1-client";
import type { PerformanceMode, PerformancePeriod, PerformanceReport } from "../types";

export type PerformanceQuery = {
  mode?: PerformanceMode;
  period?: PerformancePeriod;
  /** ГГГГ-ММ-ДД, только с `period: "range"`. */
  from?: string;
  to?: string;
  groupId?: string;
};

/** GET /performance/report: итого, группы, обучающиеся, топ ошибок. */
export function getPerformanceReport(
  query: PerformanceQuery,
  signal?: AbortSignal,
): Promise<PerformanceReport> {
  return v1ApiClient.get<PerformanceReport>("/performance/report", { ...query }, signal);
}

/** Адрес Excel-выгрузки (GET /performance/export.xlsx): обычная ссылка, сессия — cookie. */
export function performanceXlsxUrl(query: PerformanceQuery): string {
  return `${v1ApiBaseUrl}/performance/export.xlsx${buildQuery({ ...query })}`;
}

/** Адрес PDF-сводки (GET /performance/export.pdf) для печати. */
export function performancePdfUrl(query: PerformanceQuery): string {
  return `${v1ApiBaseUrl}/performance/export.pdf${buildQuery({ ...query })}`;
}
