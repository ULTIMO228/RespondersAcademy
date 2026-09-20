/*
 * Сущность «Система» (spec/05-data-models.md §9): контрактные типы мок-слоя + словари состояний
 * и правила, общие для экрана администратора. Данные приходят через клиент `@/shared/api`.
 */
export type { SystemIntegrity, SystemLogEntry, SystemLogLevel, SystemMonitoring } from "@/shared/api";
export type { SystemService, SystemServiceAction, SystemServiceState } from "@/shared/api";
export type { SystemServicesResponse, SystemSettings, SystemSettingsPatch } from "@/shared/api";
export type { AuditEventType, AuditLogEntry, AuditLogQuery, UsageStats } from "@/shared/api";
export type { UsageStatsPeriod, UsageStatsPeriodId } from "@/shared/api";
export { ISOLATED_LOOP_NOTE, LOG_LEVEL_TITLES, LOG_LEVELS } from "./config/titles";
export { SERVICE_ACTION_TITLES, SERVICE_STATE_TITLES, SESSION_LOCK_NOTE } from "./config/titles";
export { formatUptime } from "./lib/formatUptime";
export { describeSource, findActiveFailures, hasActiveFailure, listCriticalEvents } from "./model/failures";
