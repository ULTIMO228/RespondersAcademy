/*
 * Store раздела «Система» (T4.2-01): лента системных журналов и сводка самопроверки целостности.
 * Сервисы и настройки лежат в том же store — их аксессоры уже есть в store-admin.ts.
 * Наружу — только копии (cloneOut); изменять состояние можно лишь функциями этого модуля.
 */
import type { SystemIntegrity, SystemLogEntry, SystemLogLevel } from "../types";
import { cloneOut, getMockState, MOCK_ID_PREFIX, nextMockId } from "./store";
import { nowIso } from "./time";

/** Лента журналов, новые записи — первыми. */
export function listSystemLogs(): SystemLogEntry[] {
  return cloneOut(getMockState().systemLogs);
}

export type SystemLogInput = { level: SystemLogLevel; source: string; message: string };

/** Событие сервисов в ленту журналов: id "log-NNN", метка времени ISO +03:00. */
export function appendSystemLog(input: SystemLogInput): SystemLogEntry {
  const entry: SystemLogEntry = { id: nextMockId(MOCK_ID_PREFIX.systemLog), at: nowIso(), ...input };
  getMockState().systemLogs.unshift(entry);
  return cloneOut(entry);
}

export function readSystemIntegrity(): SystemIntegrity {
  return cloneOut(getMockState().systemIntegrity);
}

export function updateSystemIntegrity(updater: (draft: SystemIntegrity) => void): SystemIntegrity {
  const state = getMockState();
  updater(state.systemIntegrity);
  return cloneOut(state.systemIntegrity);
}
