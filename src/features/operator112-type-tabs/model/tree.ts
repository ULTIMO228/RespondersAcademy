/*
 * Дерево опросной карты по классификатору ЕКП: группа происшествия → Признак.1 → Признак.2 → Признак.3 → строка ЕКП.
 * Логику выбора строки и список оповещения считает сервер (notification-list); дерево нужно только для показа вариантов
 * и для итогового типа/кода в карточке (memo: server сверяет признаки по префиксу, ml/classify/notification_list.py).
 */
import type { ClassifierEntry } from "@/shared/api";

export type SignLevel = 0 | 1 | 2;

const SIGN_FIELDS = ["sign1", "sign2", "sign3"] as const;
export const SIGN_LEVEL_TITLES = ["112-Признак.1", "112-Признак.2", "112-Признак.3"] as const;

export type Selection = { group: string; signs: string[] };
export const EMPTY_SELECTION: Selection = { group: "", signs: [] };

/** Названия групп в порядке классификатора (без повторов). */
export function listGroups(entries: readonly ClassifierEntry[]): string[] {
  return Array.from(new Set(entries.map((entry) => entry.group)));
}

function matches(entry: ClassifierEntry, signs: readonly string[]): boolean {
  return signs.every((sign, index) => entry[SIGN_FIELDS[index]].trim() === sign);
}

/** Строки группы, согласованные с выбранными признаками (по префиксу). */
export function entriesFor(entries: readonly ClassifierEntry[], selection: Selection): ClassifierEntry[] {
  if (!selection.group) return [];
  return entries.filter((entry) => entry.group === selection.group && matches(entry, selection.signs));
}

export type LevelOptions = { level: SignLevel; title: string; options: string[]; selected: string | null };

/** Уровни, которые нужно показать: уже выбранные (с вариантами для смены) и первый невыбранный, если у него есть варианты. */
export function visibleLevels(entries: readonly ClassifierEntry[], selection: Selection): LevelOptions[] {
  const levels: LevelOptions[] = [];
  for (let level = 0; level < SIGN_FIELDS.length; level += 1) {
    const prefix = selection.signs.slice(0, level);
    const pool = entriesFor(entries, { group: selection.group, signs: prefix });
    const options = Array.from(
      new Set(pool.map((entry) => entry[SIGN_FIELDS[level]].trim()).filter(Boolean)),
    );
    if (options.length === 0) break;
    const selected = selection.signs[level] ?? null;
    levels.push({ level: level as SignLevel, title: SIGN_LEVEL_TITLES[level], options, selected });
    if (selected === null) break;
  }
  return levels;
}

/** Строка ЕКП, определяемая выбором: единственная подходящая (или первая, если различаются только доп. признаки). */
export function resolveEntry(
  entries: readonly ClassifierEntry[],
  selection: Selection,
): ClassifierEntry | undefined {
  const pool = entriesFor(entries, selection);
  if (pool.length === 0) return undefined;
  const remainingLevel = SIGN_FIELDS.findIndex(
    (field, index) => index >= selection.signs.length && pool.some((entry) => entry[field].trim()),
  );
  return remainingLevel === -1 ? pool[0] : undefined;
}

/** Выбор на уровне: повторный клик по выбранному признаку снимает его и все последующие. */
export function selectSign(selection: Selection, level: SignLevel, value: string): Selection {
  const kept = selection.signs.slice(0, level);
  return selection.signs[level] === value
    ? { ...selection, signs: kept }
    : { ...selection, signs: [...kept, value] };
}

/** Восстановление выбора по признакам события signSelected (после перезагрузки): первая строка, совпавшая с ними. */
export function restoreSelection(entries: readonly ClassifierEntry[], signs: readonly string[]): Selection {
  if (signs.length === 0) return EMPTY_SELECTION;
  const entry = entries.find((candidate) => matches(candidate, signs));
  return entry ? { group: entry.group, signs: [...signs] } : EMPTY_SELECTION;
}
