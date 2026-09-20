/*
 * Раздел «Система» администратора (21-admin-system.md §1–§3, T4.2-03…T4.2-05):
 * состояние сервисов и мок-действия над ними, настройки с валидацией нормативов ТЗ,
 * лента системных журналов, ряды мониторинга и статистика использования.
 *
 * ЧЕСТНО О МОКЕ: старт/стоп/перезапуск не управляют процессами — это переходы состояния в store
 * с пересчётом аптайма; автовосстановление и отказоустойчивость узлов — декларация для бэкенда
 * (01-requirements-map.md §9). Ряды мониторинга статичны (mocks/admin/monitoring.json).
 */
import { validateSettingsPatch } from "../validation/settings";
import type {
  SystemIntegrity,
  SystemLogEntry,
  SystemLogLevel,
  SystemMonitoring,
  SystemService,
  SystemServiceAction,
  SystemServicesResponse,
  SystemSettings,
  SystemSettingsPatch,
  UsageStats,
  UsageStatsPeriodId,
} from "../types";
import { readMonitoringMock, readUsageStatsMock } from "./readers-system";
import { isRecord, readJsonBody, readStringParam } from "./request";
import { conflict, notFound, unprocessable, validationFailed } from "./respond";
import { appendAuditEntry, listSystemServices, readSystemSettings } from "./store-admin";
import { updateSystemService, updateSystemSettings } from "./store-admin";
import { appendSystemLog, listSystemLogs, readSystemIntegrity } from "./store-system";
import { listStoredSessions } from "./store-training";

export const SERVICE_ACTIONS: readonly SystemServiceAction[] = ["start", "stop", "restart"];
export const LOG_LEVELS: readonly SystemLogLevel[] = ["INFO", "WARN", "ERROR"];
export const USAGE_PERIODS: readonly UsageStatsPeriodId[] = ["week", "month"];

export const AUDIT_ACTION_SERVICE = "service.action";
export const AUDIT_ACTION_SETTINGS = "settings.update";
export const AUDIT_ACTION_BACKUP = "backup.run";

export const SESSION_LOCK_MESSAGE =
  "Недоступно во время активного занятия: остановка критичного сервиса прервёт учебный процесс";

const ACTION_TITLES: Record<SystemServiceAction, string> = {
  start: "Запуск",
  stop: "Остановка",
  restart: "Перезапуск",
};

/* ─── Сервисы ───────────────────────────────────────────────────────────────────────────────────── */

/** GET /admin/system/services — плитки сервисов + сводка самопроверки целостности. */
export function getSystemServices(): SystemServicesResponse {
  return { services: listSystemServices(), integrity: getSystemIntegrity() };
}

export function getSystemIntegrity(): SystemIntegrity {
  return readSystemIntegrity();
}

/** Идёт ли занятие: блокировка действий, влияющих на учебный процесс (ТЗ §8). */
export function hasRunningSession(): boolean {
  return listStoredSessions().some((session) => session.state === "running");
}

function parseAction(value: unknown): SystemServiceAction {
  if (typeof value !== "string" || !(SERVICE_ACTIONS as readonly string[]).includes(value)) {
    throw validationFailed(
      `Некорректное действие над сервисом: «${String(value)}». Допустимо: start, stop, restart`,
    );
  }
  return value as SystemServiceAction;
}

/** Переход состояния сервиса: start/restart → running с обнулением аптайма, stop → stopped. */
function applyAction(draft: SystemService, action: SystemServiceAction): void {
  if (action === "stop") {
    draft.state = "stopped";
    draft.uptimeSec = 0;
    return;
  }
  // start идемпотентен: уже запущенный сервис аптайм не теряет; restart обнуляет его всегда.
  if (action === "restart" || draft.state !== "running") {
    draft.state = "running";
    draft.uptimeSec = 0;
  }
}

/**
 * POST /admin/system/services/[id]/action — мок-действие над сервисом.
 * Остановка и перезапуск критичного сервиса во время идущего занятия запрещены (409).
 */
export async function runServiceAction(
  serviceId: string,
  httpRequest: Request,
): Promise<SystemServicesResponse> {
  const body = await readJsonBody(httpRequest);
  const action = parseAction(body.action);
  const service = listSystemServices().find((candidate) => candidate.id === serviceId);
  if (!service) throw notFound(`Сервис «${serviceId}» не найден`);
  if (service.critical && action !== "start" && hasRunningSession()) throw conflict(SESSION_LOCK_MESSAGE);
  const updated = updateSystemService(serviceId, (draft) => applyAction(draft, action));
  if (!updated) throw notFound(`Сервис «${serviceId}» не найден`);
  const details = `${ACTION_TITLES[action]} сервиса «${updated.name}»: состояние ${updated.state}`;
  appendSystemLog({ level: action === "stop" ? "WARN" : "INFO", source: updated.id, message: details });
  appendAuditEntry({
    userId: typeof body.adminId === "string" ? body.adminId : "",
    role: "admin",
    action: AUDIT_ACTION_SERVICE,
    details,
  });
  return getSystemServices();
}

/* ─── Настройки ─────────────────────────────────────────────────────────────────────────────────── */

export function getSystemSettings(): SystemSettings {
  return readSystemSettings();
}

/** Патч читается по секциям: `database` не принимается (read-only, 21-admin-system.md §3). */
function readPatch(body: Record<string, unknown>): SystemSettingsPatch {
  const section = (key: keyof SystemSettingsPatch) => (isRecord(body[key]) ? body[key] : undefined);
  return {
    telephony: section("telephony"),
    backup: section("backup"),
    logging: section("logging"),
    security: section("security"),
    performance: section("performance"),
    autoRecovery: section("autoRecovery"),
  } as SystemSettingsPatch;
}

function mergeSection<TSection extends object>(target: TSection, patch: Partial<TSection> | undefined): void {
  if (!patch) return;
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (target as Record<string, unknown>)[key] = value;
  }
}

function describePatch(patch: SystemSettingsPatch): string {
  return Object.entries(patch)
    .filter(([, value]) => isRecord(value) && Object.keys(value).length > 0)
    .map(([key, value]) => `${key}: ${Object.keys(value as object).join(", ")}`)
    .join("; ");
}

/**
 * PATCH /admin/system/settings — сохранение настроек с проверкой нормативов ТЗ (422 со списком полей).
 * Обновление `backup.lastAt` — это «Выполнить сейчас», поэтому пишется отдельным событием «бэкап».
 */
export async function patchSystemSettings(httpRequest: Request): Promise<SystemSettings> {
  const body = await readJsonBody(httpRequest);
  const patch = readPatch(body);
  const errors = validateSettingsPatch(patch);
  if (errors.length > 0) {
    throw unprocessable(`Настройки не сохранены. ${errors.map((error) => error.message).join("; ")}`);
  }
  const saved = updateSystemSettings((draft) => {
    mergeSection(draft.telephony, patch.telephony);
    mergeSection(draft.backup, patch.backup);
    mergeSection(draft.logging, patch.logging);
    mergeSection(draft.security, patch.security);
    mergeSection(draft.performance, patch.performance);
    mergeSection(draft.autoRecovery, patch.autoRecovery);
  });
  const isBackupRun = patch.backup?.lastAt !== undefined;
  const userId = typeof body.adminId === "string" ? body.adminId : "";
  if (isBackupRun) {
    appendSystemLog({
      level: "INFO",
      source: "svc-backup",
      message: "Бэкап выполнен вручную: архив создаётся со сжатием",
    });
    appendAuditEntry({
      userId,
      role: "admin",
      action: AUDIT_ACTION_BACKUP,
      details: `Резервное копирование выполнено, метка последнего бэкапа: ${saved.backup.lastAt}`,
    });
  }
  const changed = describePatch(patch);
  if (changed !== "" && !isBackupRun) {
    appendSystemLog({ level: "INFO", source: "svc-web", message: `Изменены настройки — ${changed}` });
    appendAuditEntry({
      userId,
      role: "admin",
      action: AUDIT_ACTION_SETTINGS,
      details: `Изменены настройки системы — ${changed}`,
    });
  }
  return saved;
}

/* ─── Журналы, мониторинг, статистика ───────────────────────────────────────────────────────────── */

/** GET /admin/system/logs?level=INFO|WARN|ERROR. */
export function getSystemLogs(params: URLSearchParams): SystemLogEntry[] {
  const level = readStringParam(params, "level");
  if (level === undefined) return listSystemLogs();
  if (!(LOG_LEVELS as readonly string[]).includes(level)) {
    throw validationFailed(`Некорректный уровень логов: «${level}». Допустимо: INFO, WARN, ERROR`);
  }
  return listSystemLogs().filter((entry) => entry.level === level);
}

/** GET /admin/system/monitoring — статичные ряды мока (объективность диаграмм, ТЗ §17). */
export function getMonitoring(): SystemMonitoring {
  return structuredClone(readMonitoringMock());
}

/** GET /admin/system/usage-stats?period=week|month. */
export function getUsageStats(params: URLSearchParams): UsageStats {
  const period = readStringParam(params, "period");
  const stats = structuredClone(readUsageStatsMock());
  if (period === undefined) return stats;
  if (!(USAGE_PERIODS as readonly string[]).includes(period)) {
    throw validationFailed(`Некорректный период статистики: «${period}». Допустимо: week, month`);
  }
  return { periods: stats.periods.filter((item) => item.id === period) };
}
