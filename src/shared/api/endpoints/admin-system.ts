/*
 * Клиент раздела «Система» администратора (T4.2-06): /admin/system/* и журнал аудита /admin/audit.
 * Экран `pages/admin-system` не знает про fetch и URL — только про эти функции (10-code-rules.md §6).
 */
import { apiClient } from "../client";
import type {
  AuditLogEntry,
  AuditLogQuery,
  PageResponse,
  SystemLogEntry,
  SystemLogsQuery,
  SystemMonitoring,
  SystemServiceAction,
  SystemServicesResponse,
  SystemSettings,
  SystemSettingsPatch,
  UsageStats,
  UsageStatsQuery,
} from "../types";
import { API_PATHS } from "./paths";

/** GET /admin/system/services — плитки сервисов + сводка целостности. */
export function getSystemServices(signal?: AbortSignal): Promise<SystemServicesResponse> {
  return apiClient.get<SystemServicesResponse>(API_PATHS.systemServices, undefined, signal);
}

/** POST /admin/system/services/[id]/action — мок-действие Запустить/Остановить/Перезапустить. */
export function postSystemServiceAction(
  serviceId: string,
  action: SystemServiceAction,
  adminId?: string,
): Promise<SystemServicesResponse> {
  return apiClient.post<SystemServicesResponse>(API_PATHS.systemServiceAction(serviceId), {
    action,
    adminId,
  });
}

export function getSystemSettings(signal?: AbortSignal): Promise<SystemSettings> {
  return apiClient.get<SystemSettings>(API_PATHS.systemSettings, undefined, signal);
}

/** PATCH /admin/system/settings — 422, если значения нарушают нормативы ТЗ. */
export function patchSystemSettings(patch: SystemSettingsPatch): Promise<SystemSettings> {
  return apiClient.patch<SystemSettings>(API_PATHS.systemSettings, patch);
}

export function getSystemMonitoring(signal?: AbortSignal): Promise<SystemMonitoring> {
  return apiClient.get<SystemMonitoring>(API_PATHS.systemMonitoring, undefined, signal);
}

export function getSystemUsageStats(query?: UsageStatsQuery, signal?: AbortSignal): Promise<UsageStats> {
  return apiClient.get<UsageStats>(API_PATHS.systemUsageStats, query, signal);
}

export function getSystemLogs(query?: SystemLogsQuery, signal?: AbortSignal): Promise<SystemLogEntry[]> {
  return apiClient.get<SystemLogEntry[]>(API_PATHS.systemLogs, query, signal);
}

/** GET /admin/audit — журнал аудита с фильтрами и пагинацией. */
export function getAuditLog(
  query?: AuditLogQuery,
  signal?: AbortSignal,
): Promise<PageResponse<AuditLogEntry>> {
  return apiClient.get<PageResponse<AuditLogEntry>>(API_PATHS.adminAudit, query, signal);
}

/** Единая точка данных раздела «Система» (в тестах подменяется). */
export const adminSystemApi = {
  getServices: getSystemServices,
  serviceAction: postSystemServiceAction,
  getSettings: getSystemSettings,
  patchSettings: patchSystemSettings,
  getMonitoring: getSystemMonitoring,
  getUsageStats: getSystemUsageStats,
  getAudit: getAuditLog,
  getLogs: getSystemLogs,
} as const;

export type AdminSystemApi = typeof adminSystemApi;
