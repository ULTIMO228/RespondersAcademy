import type { InternalNumber, KbArticle } from "@/shared/api";

import type { HotkeySection } from "../config/hotkeys";
import type { HelpMaterial } from "../config/materials";

/** Регистр не важен; пустой запрос подходит всему. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || text.toLowerCase().includes(needle);
}

export function filterArticles(articles: KbArticle[], query: string, group: string): KbArticle[] {
  return articles.filter(
    (article) =>
      (group === "" || article.group === group) && matchesQuery(`${article.title} ${article.group}`, query),
  );
}

export function filterNumbers(numbers: InternalNumber[], query: string): InternalNumber[] {
  return numbers.filter((item) => matchesQuery(`${item.number} ${item.title}`, query));
}

export function filterMaterials(materials: HelpMaterial[], query: string): HelpMaterial[] {
  return materials.filter((item) => matchesQuery(`${item.title} ${item.description}`, query));
}

/** Разделы горячих клавиш, в которых остались подходящие строки (строки фильтруются, пустые разделы скрываются). */
export function filterHotkeys(sections: HotkeySection[], query: string): HotkeySection[] {
  return sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => matchesQuery(`${row.keys} ${row.action} ${section.title}`, query)),
    }))
    .filter((section) => section.rows.length > 0);
}
