/*
 * Ограничения раздела «Система» (21-admin-system.md «Ограничения», ТЗ §8):
 * во время идущего занятия действия, влияющие на учебный процесс, заблокированы;
 * удаление критичных данных — только после свежего бэкапа (не старше 24 ч).
 * Состояние занятия приходит из мок-API (GET /sessions), а не прямым импортом мока.
 */
import type { SessionContract, SystemService, SystemServiceAction } from "@/shared/api";
import { SESSION_LOCK_NOTE } from "@/entities/system";

const HOURS_24_MS = 24 * 60 * 60 * 1000;

export const BACKUP_STALE_NOTE =
  "Последний бэкап старше 24 часов: перед удалением критичных данных выполните резервное копирование";

export { SESSION_LOCK_NOTE };

/** Идёт ли занятие: единственный источник — состояния занятий из мок-API. */
export function hasRunningSession(sessions: SessionContract[]): boolean {
  return sessions.some((session) => session.state === "running");
}

/**
 * Заблокировано ли действие над сервисом. Запуск разрешён всегда; остановка и перезапуск
 * критичного сервиса во время занятия — нет (тот же запрет продублирован на сервере, 409).
 */
export function isServiceActionLocked(
  service: SystemService,
  action: SystemServiceAction,
  sessionRunning: boolean,
): boolean {
  return sessionRunning && service.critical && action !== "start";
}

/** Устарел ли последний бэкап (> 24 ч) — предупреждение перед удалением критичных данных. */
export function isBackupStale(lastAt: string, nowMs: number): boolean {
  const lastMs = Date.parse(lastAt);
  if (Number.isNaN(lastMs)) return true;
  return nowMs - lastMs > HOURS_24_MS;
}
