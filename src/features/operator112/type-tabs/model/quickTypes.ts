/*
 * Строка «что случилось?» карточки ПОВ-112 (КАРТОЧКА_image1): поиск группы ЕКП по слову и быстрые типы.
 * Быстрые типы — с референса; запрос — слово, по которому тип находится в классификаторе учебного набора.
 * Служебные типы референса без группы в учебном классификаторе («Тестовый вызов», «Передача дежурства»…) не показываются:
 * выбрать их нечем, а неактивные кнопки сбивают ученика.
 */
import { listGroups } from "./tree";
import type { ClassifierEntry } from "@/shared/api";

export type QuickType = { label: string; query?: string };

export const QUICK_TYPES: readonly QuickType[] = [
  { label: "ДТП", query: "Дорожно-транспортные" },
  { label: "104", query: "газ" },
  { label: "Человек в опасности", query: "Человек в опасности" },
  { label: "Консультация", query: "Справочно-консультационная" },
];

/** Подсказки «что случилось?» не длиннее экрана: остальное уточняется вводом. */
export const SUGGEST_LIMIT = 12;

/** Группы ЕКП, в названии которых есть каждое слово запроса (без учёта регистра); пустой запрос — пусто. */
export function matchGroups(entries: readonly ClassifierEntry[], query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return listGroups(entries).filter((group) => {
    const name = group.toLowerCase();
    return words.every((word) => name.includes(word));
  });
}
