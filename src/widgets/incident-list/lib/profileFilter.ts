import type { ProfileCategoryRow } from "@/entities/session";

/*
 * Профильный фильтр ленты занятия (T2.2-14, ТЗ §10 сценарий А шаг 5; spec/04-pages/11 «Профильные категории»):
 * служба курсанта (User.service) → профильные группы ЕКП по таблице привязки преподавателя. Таблица передаётся
 * параметром (источник — привязка преподавателя из entities/session), в коде фильтра групп нет.
 * Нет строки привязки для службы — фильтр не применяется (преподаватель профиль не настраивал).
 */

export type ProfileGroups = ReadonlySet<string> | null;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU");
}

/** Группы ЕКП профиля службы курсанта; null — привязки нет (лента не фильтруется). */
export function resolveProfileGroups(
  service: string | undefined,
  profiles: readonly ProfileCategoryRow[],
): ProfileGroups {
  if (!service) return null;
  const row = profiles.find((candidate) => normalize(candidate.profile) === normalize(service));
  return row ? new Set(row.incidentGroups.map(normalize)) : null;
}

/** Карточка группы `group` проходит профильный фильтр (без профиля — любая). */
export function isProfileCard(group: string, profileGroups: ProfileGroups): boolean {
  return profileGroups === null || profileGroups.has(normalize(group));
}

/** Элементы ленты только профильных групп; порядок сохраняется. */
export function filterByProfile<TItem>(
  items: readonly TItem[],
  getGroup: (item: TItem) => string,
  profileGroups: ProfileGroups,
): TItem[] {
  return items.filter((item) => isProfileCard(getGroup(item), profileGroups));
}
