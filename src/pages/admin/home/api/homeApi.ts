/* Зависимости главной администратора: состояние сервера и системные данные за интерфейсом. */
import { adminListUsers, getAuditLog, getHealth, getSystemMonitoring, getSystemServices } from "@/shared/api";
import type {
  AuditLogEntry,
  HealthStatus,
  PageResponse,
  PublicUser,
  SystemMonitoring,
  SystemServicesResponse,
} from "@/shared/api";

export type AdminHomeApi = {
  health: (signal?: AbortSignal) => Promise<HealthStatus>;
  services: (signal?: AbortSignal) => Promise<SystemServicesResponse>;
  monitoring: (signal?: AbortSignal) => Promise<SystemMonitoring>;
  users: (signal?: AbortSignal) => Promise<PublicUser[]>;
  audit: (signal?: AbortSignal) => Promise<PageResponse<AuditLogEntry>>;
};

export const RECENT_AUDIT_COUNT = 8;

export const adminHomeApi: AdminHomeApi = {
  health: (signal) => getHealth(signal),
  services: (signal) => getSystemServices(signal),
  monitoring: (signal) => getSystemMonitoring(signal),
  users: (signal) => adminListUsers(undefined, signal),
  audit: (signal) => getAuditLog({ page: 1, perPage: RECENT_AUDIT_COUNT }, signal),
};
