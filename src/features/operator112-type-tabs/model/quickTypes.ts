/*
 * Строка «что случилось?» карточки ПОВ-112 (КАРТОЧКА_image1): поиск группы ЕКП по слову и быстрые типы.
 * Быстрые типы — дословно с референса; запрос — слово, по которому тип находится в классификаторе учебного набора.
 * Тип без группы в классификаторе (служебные: «Тестовый вызов», «Передача дежурства»…) показывается неактивным.
 */
import { listGroups } from "./tree";
import type { ClassifierEntry } from "@/shared/api";

export type QuickType = { label: string; query?: string };

export const QUICK_TYPES: readonly QuickType[] = [
  { label: "ДТП", query: "Дорожно-транспортные" },
  { label: "Ошибочно набран номер" },
  { label: "104", query: "газ" },
  { label: "Человек в опасности", query: "Человек в опасности" },
  { label: "Отмена вызова" },
  { label: "Тестовый вызов" },
  { label: "Передача дежурства" },
  { label: "Консультация", query: "Справочно-консультационная" },
  { label: "Вызов на иностранном языке" },
  { label: "Справка-101" },
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
