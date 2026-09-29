/* Зависимости страницы «Безопасность»: настройки системы за интерфейсом. */
import { getSystemSettings, patchSystemSettings } from "@/shared/api";
import type { SystemSettings, SystemSettingsPatch } from "@/shared/api";

export type AdminSecurityApi = {
  getSettings: (signal?: AbortSignal) => Promise<SystemSettings>;
  patchSettings: (patch: SystemSettingsPatch) => Promise<SystemSettings>;
};

export const adminSecurityApi: AdminSecurityApi = {
  getSettings: (signal) => getSystemSettings(signal),
  patchSettings: (patch) => patchSystemSettings(patch),
};
