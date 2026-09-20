/*
 * Администрирование — spec/05-data-models.md §9. Сид сервисов и настроек создаёт in-memory store;
 * сид журнала аудита — мок уровня приложения `mocks/admin/audit-log.json` (T4.1-01).
 */
import type { Role } from "./user";

export type SystemServiceState = "running" | "stopped" | "degraded";

export interface SystemService {
  id: string;
  name: string;
  state: SystemServiceState;
  uptimeSec: number;
  /** [расширение] критичный сервис: остановка — под двойным подтверждением (21-admin-system.md §1). */
  critical: boolean;
  /** [расширение] назначение сервиса — подпись на плитке. */
  description: string;
}

/** [расширение] Мок-действия над сервисом (21-admin-system.md §1). */
export type SystemServiceAction = "start" | "stop" | "restart";

export interface SystemServiceActionRequest {
  action: SystemServiceAction;
  /** Инициатор действия — для записи в журнал аудита. */
  adminId?: string;
}

/** [расширение] Сводный статус самопроверки (ТЗ §8 «контроль целостности», §12 «целостность данных»). */
export interface SystemIntegrity {
  ok: boolean;
  /** ISO 8601 с московским смещением. */
  checkedAt: string;
  details: string;
}

export interface SystemServicesResponse {
  services: SystemService[];
  integrity: SystemIntegrity;
}

export type SystemLogLevel = "INFO" | "WARN" | "ERROR";

/** [расширение] Запись ленты системных журналов (21-admin-system.md §4). */
export interface SystemLogEntry {
  id: string;
  /** ISO 8601 с московским смещением. */
  at: string;
  level: SystemLogLevel;
  /** id сервиса-источника (`svc-web`, `svc-db`, …) или подсистемы (`svc-backup`). */
  source: string;
  message: string;
}

export type SystemLogsQuery = {
  level?: SystemLogLevel;
};

/**
 * Запись журнала аудита (05-data-models.md §9). Поля `cardId`/`operatorArm` — [app-расширение] для
 * фильтров журнала «по карточке» и «по оператору» (21-admin-system.md §4, образец экрана «аудит» ПОВ-112).
 */
export interface AuditLogEntry {
  id: string;
  /** ISO 8601 с московским смещением. */
  at: string;
  userId: string;
  role: Role;
  action: string;
  details: string;
  ip?: string;
  /** [расширение] карточка происшествия, к которой относится событие (фильтр «по карточке»). */
  cardId?: string;
  /** [расширение] номер АРМ оператора на момент события (фильтр «по оператору»). */
  operatorArm?: number;
}

export interface SystemSettings {
  telephony: { sipServer: string; realm: string; enabled: boolean };
  /** Read-only в демо: правится только конфигурацией сервера (21-admin-system.md §3). */
  database: { host: string; name: string };
  /** Бэкап не реже 1 раза в сутки (ТЗ §9). */
  backup: { periodHours: number; lastAt: string };
  /** Журналы ≥ 6 мес (ТЗ §9). */
  logging: { level: SystemLogLevel; retentionMonths: number };
  /** [расширение] Безопасность и политики доступа (21-admin-system.md §3; ТЗ §8, §9). */
  security: { require2fa: boolean; minPasswordLength: number; lockAfterAttempts: number };
  /** [расширение] Производительность: ≥ 20 одновременных сессий (ТЗ §7), опрос ленты, буфер ввода. */
  performance: { sessionLimit: number; refreshIntervalSec: number; inputBufferRecords: number };
  /** [расширение] Автовосстановление сервисов после сбоев (ТЗ §9) — декларация для бэкенда. */
  autoRecovery: { enabled: boolean; restartAttempts: number };
}

/** Частичное обновление настроек (`PATCH /admin/system/settings`); `database` не изменяется. */
export interface SystemSettingsPatch {
  telephony?: Partial<SystemSettings["telephony"]>;
  backup?: Partial<SystemSettings["backup"]>;
  logging?: Partial<SystemSettings["logging"]>;
  security?: Partial<SystemSettings["security"]>;
  performance?: Partial<SystemSettings["performance"]>;
  autoRecovery?: Partial<SystemSettings["autoRecovery"]>;
  /** Инициатор изменения — для записи в журнал аудита. */
  adminId?: string;
}

/** [расширение] Ряды мониторинга нагрузки за окно `windowHours` (21-admin-system.md §2; ТЗ §7). */
export interface SystemMonitoring {
  generatedAt: string;
  windowHours: number;
  stepMinutes: number;
  labels: string[];
  series: {
    cpuPercent: number[];
    memoryPercent: number[];
    networkMbit: number[];
    activeSessions: number[];
    responseSec: number[];
  };
  norms: { sessionLimit: number; responseSec: number };
}

export type UsageStatsPeriodId = "week" | "month";

/** [расширение] Статистика использования за период (ТЗ §8 «анализ статистики использования»). */
export interface UsageStatsPeriod {
  id: UsageStatsPeriodId;
  label: string;
  loginsByRole: { labels: string[]; values: number[] };
  activityByTime: { labels: string[]; values: number[] };
  cards: { labels: string[]; created: number[]; worked: number[] };
}

export interface UsageStats {
  periods: UsageStatsPeriod[];
}

export type UsageStatsQuery = {
  period?: UsageStatsPeriodId;
};

/** Тип события журнала аудита (21-admin-system.md §4, селект «Тип события»). */
export type AuditEventType = "login" | "users" | "grades" | "settings" | "backup" | "card" | "content";

/** Фильтры журнала аудита по образцу экрана «аудит» ПОВ-112. */
export type AuditLogQuery = {
  type?: AuditEventType;
  /** Поиск «по оператору»: ФИО, логин или № АРМ. */
  operator?: string;
  /** Поиск «по карточке»: id карточки. */
  card?: string;
  /** Период: ISO-метки включительно. */
  from?: string;
  to?: string;
  /** Полнотекстовый поиск по событию и описанию. */
  q?: string;
  page?: number;
  perPage?: number;
};
