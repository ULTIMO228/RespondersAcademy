/*
 * Службы оранжевой панели карточки ПОВ-112 (КАРТОЧКА_image3): плитки — список оповещения сервера, окно «Добавьте службы» —
 * он же плюс условные службы, которые можно добавить вручную. Одна служба может прийти несколькими строками (разные
 * условия) — на экране она одна.
 */
import type { NotificationListItem } from "@/shared/api";

export type ServiceOption = { serviceId: string; title: string; isListed: boolean };

export function uniqueServices(items: readonly NotificationListItem[]): NotificationListItem[] {
  const seen = new Set<string>();
  return items.filter((item) => (seen.has(item.serviceId) ? false : (seen.add(item.serviceId), true)));
}

/** Короткое имя плитки: «Служба 101 (МЧС)» → «Служба 101»; полное — во всплывающей подсказке. */
export function tileTitle(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim() || title;
}

/** Варианты окна «Добавьте службы»: сначала уже выбранные, затем доступные; фильтр — по словам названия. */
export function serviceOptions(
  services: readonly NotificationListItem[],
  conditional: readonly NotificationListItem[],
  query: string,
): ServiceOption[] {
  const listed = uniqueServices(services);
  const listedIds = new Set(listed.map((item) => item.serviceId));
  const options = [
    ...listed.map((item) => ({ serviceId: item.serviceId, title: item.title, isListed: true })),
    ...uniqueServices(conditional)
      .filter((item) => !listedIds.has(item.serviceId))
      .map((item) => ({ serviceId: item.serviceId, title: item.title, isListed: false })),
  ];
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return options.filter((option) => words.every((word) => option.title.toLowerCase().includes(word)));
}
