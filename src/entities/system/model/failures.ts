import type { SystemLogEntry, SystemService } from "@/shared/api";

/**
 * Активный сбой (21-admin-system.md §1 «Оповещения об ошибках»): сервис работает с ошибками или
 * остановлен критичный сервис. Ровно это правило включает баннер в шапке страницы.
 */
export function findActiveFailures(services: SystemService[]): SystemService[] {
  return services.filter(
    (service) => service.state === "degraded" || (service.state === "stopped" && service.critical),
  );
}

export function hasActiveFailure(services: SystemService[]): boolean {
  return findActiveFailures(services).length > 0;
}

/** Лента критических событий — записи уровня ERROR (новые сверху уже приходят из мок-слоя). */
export function listCriticalEvents(logs: SystemLogEntry[]): SystemLogEntry[] {
  return logs.filter((entry) => entry.level === "ERROR");
}

/** Название сервиса по id для подписи события журнала; неизвестный id — сам id. */
export function describeSource(services: SystemService[], source: string): string {
  return services.find((service) => service.id === source)?.name ?? source;
}
