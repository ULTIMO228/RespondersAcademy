/* Зависимости страницы «Успеваемость»: сводка и список групп для фильтра (в тестах подменяются целиком). */
import { getPerformanceReport, listErrorMapGroups } from "@/shared/api";
import type { ErrorMapGroup, PerformanceQuery, PerformanceReport } from "@/shared/api";

export type PerformanceApi = {
  report: (query: PerformanceQuery, signal?: AbortSignal) => Promise<PerformanceReport>;
  groups: (signal?: AbortSignal) => Promise<ErrorMapGroup[]>;
};

export const performanceApi: PerformanceApi = {
  report: (query, signal) => getPerformanceReport(query, signal),
  groups: (signal) => listErrorMapGroups(signal),
};
