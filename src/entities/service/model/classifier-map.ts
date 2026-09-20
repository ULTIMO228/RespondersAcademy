/*
 * Маппинг имени службы классификатора (ClassifierEntry.notifications[].service) → ServiceRef (T1.2-07).
 * Правило — дословно spec/05-data-models.md §2.5 и reference.json → meta.servicesNote:
 *   1) точная строка ServiceRef.classifierName;
 *   2) если classifierName не задан — совпадение с name, затем с shortName.
 * Самодельной нормализации регистра/пробелов нет: варианты написания нормализуются в данных, а не в коде
 * (напр. «карточка -112» в v.046_24 не встречается; появится — правится reference.json).
 * Функции чистые: справочник и классификатор передаёт вызывающий код (данные ридеров).
 */
import type { ClassifierEntry, ServiceRef } from "@/shared/api";

type ClassifierEntryServices = Pick<ClassifierEntry, "notifications">;

export function resolveServiceByClassifierName(
  name: string,
  services: readonly ServiceRef[],
): ServiceRef | null {
  const exact = services.find((service) => service.classifierName === name);
  if (exact) return exact;
  const withoutClassifierName = services.filter((service) => service.classifierName === undefined);
  return (
    withoutClassifierName.find((service) => service.name === name) ??
    withoutClassifierName.find((service) => service.shortName === name) ??
    null
  );
}

/** Уникальные имена служб из notifications классификатора в порядке первого появления. */
export function collectClassifierServiceNames(entries: readonly ClassifierEntryServices[]): string[] {
  const names = new Set<string>();
  for (const entry of entries) {
    for (const notification of entry.notifications) names.add(notification.service);
  }
  return [...names];
}

/** Диагностика: имена служб классификатора, не сопоставленные ни с одним ServiceRef (ожидается []). */
export function collectUnmappedClassifierServices(
  entries: readonly ClassifierEntryServices[],
  services: readonly ServiceRef[],
): string[] {
  return collectClassifierServiceNames(entries).filter(
    (name) => resolveServiceByClassifierName(name, services) === null,
  );
}
