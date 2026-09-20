/* Системные эндпоинты админки; реестр пользователей — ./admin-users.ts (T4.1-04). */
import { apiClient } from "../client";
import type {
  AuditLogEntry,
  AuditLogQuery,
  PageResponse,
  PublicUser,
  SystemService,
  SystemSettings,
  ToggleUserActiveRequest,
} from "../types";
import { API_PATHS } from "./paths";

/** POST /admin/users/[id]/toggle-active — инверсия isActive + запись аудита. */
export function adminToggleUserActive(userId: string, body: ToggleUserActiveRequest): Promise<PublicUser> {
  return apiClient.post<PublicUser>(API_PATHS.adminUserToggleActive(userId), body);
}

export function adminListServices(signal?: AbortSignal): Promise<SystemService[]> {
  return apiClient.get<SystemService[]>(API_PATHS.adminServices, undefined, signal);
}

/**
 * GET /admin/audit — с фазы 4.2 журнал отдаётся страницами и с фильтрами (T4.2-05):
 * `{ items, total, page, perPage }`. Для экрана «Система» — `adminSystemApi.getAudit`.
 */
export function adminListAudit(
  query?: AuditLogQuery,
  signal?: AbortSignal,
): Promise<PageResponse<AuditLogEntry>> {
  return apiClient.get<PageResponse<AuditLogEntry>>(API_PATHS.adminAudit, query, signal);
}

export function adminGetSettings(signal?: AbortSignal): Promise<SystemSettings> {
  return apiClient.get<SystemSettings>(API_PATHS.adminSettings, undefined, signal);
}
