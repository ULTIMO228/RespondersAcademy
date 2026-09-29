/* Зависимости страницы «Аудит»: журнал и реестр пользователей за интерфейсом. */
import { adminListUsers, getAuditLog } from "@/shared/api";
import type { AuditLogEntry, AuditLogQuery, PageResponse, PublicUser } from "@/shared/api";

export type AdminAuditApi = {
  getAudit: (query: AuditLogQuery, signal?: AbortSignal) => Promise<PageResponse<AuditLogEntry>>;
  listUsers: (signal?: AbortSignal) => Promise<PublicUser[]>;
};

export const adminAuditApi: AdminAuditApi = {
  getAudit: (query, signal) => getAuditLog(query, signal),
  listUsers: (signal) => adminListUsers(undefined, signal),
};
