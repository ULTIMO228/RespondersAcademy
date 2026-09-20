/*
 * Ридеры моков раздела «Система» администратора (T4.2-01, T4.2-02): состояние сервисов и целостность,
 * настройки, лента системных журналов, ряды мониторинга и статистика использования.
 * Правила те же, что в readers.ts: импорт через алиас @mocks/*, мемоизированная замороженная копия,
 * мутации — только через in-memory store (store.ts сидируется глубокой копией).
 */
import monitoringJson from "@mocks/admin/monitoring.json";
import systemLogsJson from "@mocks/admin/system-logs.json";
import systemServicesJson from "@mocks/admin/system-services.json";
import systemSettingsJson from "@mocks/admin/system-settings.json";
import usageStatsJson from "@mocks/admin/usage-stats.json";

import type {
  SystemIntegrity,
  SystemLogEntry,
  SystemMonitoring,
  SystemService,
  SystemSettings,
  UsageStats,
} from "../types";

function deepFreeze<TValue>(value: TValue): TValue {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function memoizeFrozen<TValue>(load: () => TValue): () => TValue {
  let cached: TValue | undefined;
  return () => {
    if (cached === undefined) cached = deepFreeze(structuredClone(load()));
    return cached;
  };
}

export const readSystemServicesMock = memoizeFrozen(
  (): readonly SystemService[] => systemServicesJson.services as SystemService[],
);

export const readSystemIntegrityMock = memoizeFrozen(
  (): SystemIntegrity => systemServicesJson.integrity as SystemIntegrity,
);

export const readSystemSettingsMock = memoizeFrozen(
  (): SystemSettings => systemSettingsJson.settings as SystemSettings,
);

export const readSystemLogsMock = memoizeFrozen(
  (): readonly SystemLogEntry[] => systemLogsJson.logs as SystemLogEntry[],
);

export const readMonitoringMock = memoizeFrozen((): SystemMonitoring => monitoringJson as SystemMonitoring);

export const readUsageStatsMock = memoizeFrozen((): UsageStats => usageStatsJson as UsageStats);
