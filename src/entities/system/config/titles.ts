import type { SystemLogLevel, SystemServiceAction, SystemServiceState } from "@/shared/api";

/** Состояние сервиса словами: цвет плитки дублируется текстом (доступность, 07-design-guidelines). */
export const SERVICE_STATE_TITLES: Record<SystemServiceState, string> = {
  running: "работает",
  stopped: "остановлен",
  degraded: "работает с ошибками",
};

export const SERVICE_ACTION_TITLES: Record<SystemServiceAction, string> = {
  start: "Запустить",
  stop: "Остановить",
  restart: "Перезапустить",
};

export const LOG_LEVEL_TITLES: Record<SystemLogLevel, string> = {
  INFO: "Информация",
  WARN: "Предупреждение",
  ERROR: "Ошибка",
};

export const LOG_LEVELS: readonly SystemLogLevel[] = ["INFO", "WARN", "ERROR"];

/** Пояснение к заблокированным во время занятия действиям (21-admin-system.md «Ограничения»). */
export const SESSION_LOCK_NOTE = "Недоступно во время активного занятия";

/** Пометка границы контура (ТЗ §4) — показывается в шапке секции «Состояние сервисов». */
export const ISOLATED_LOOP_NOTE = "локальная сеть класса, внешних подключений нет (ТЗ §4)";
