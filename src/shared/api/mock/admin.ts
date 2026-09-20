/*
 * Системная часть админки (T1.1-18): GET /admin/services | /admin/settings — короткие проекции store
 * для каркаса админки волны 1. Реестр пользователей и его мутации — ./admin-users.ts (T4.1-02…T4.1-03);
 * раздел «Система» (действия над сервисами, правка настроек, журналы, мониторинг) — ./system.ts (фаза 4.2),
 * журнал аудита с фильтрами и пагинацией — ./system-audit.ts (T4.2-05).
 */
import type { SystemService, SystemSettings } from "../types";
import { listSystemServices, readSystemSettings } from "./store-admin";

export function listServices(): SystemService[] {
  return listSystemServices();
}

export function getSettings(): SystemSettings {
  return readSystemSettings();
}
