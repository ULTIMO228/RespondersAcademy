/*
 * Пороги карты ошибок (спека 003, FR-004) — секция настроек раздела «Система».
 * Работает только с бэкендом (/api/v1): без него клиент отдаёт ServerRequiredError, и секция показывает «требуется сервер».
 */
import { getErrorMapSettings, saveErrorMapSettings } from "@/shared/api";
import type { ErrorMapSettings } from "@/shared/api";

export type ErrorMapSettingsApi = {
  getSettings: (signal?: AbortSignal) => Promise<ErrorMapSettings>;
  saveSettings: (settings: ErrorMapSettings) => Promise<ErrorMapSettings>;
};

export const errorMapSettingsApi: ErrorMapSettingsApi = {
  getSettings: (signal) => getErrorMapSettings(signal),
  saveSettings: (settings) => saveErrorMapSettings(settings),
};
