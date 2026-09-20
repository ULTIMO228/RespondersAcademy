/* Пагинация ленты «Страница: 1 · Записей на странице: 10 · 1-10 из N» (ДДС_image2–5). */

/** Число страниц; пустая выдача — одна (пустая) страница. */
export function getPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** «1-10 из 16» / «11-16 из 16»; пусто — «0 из 0» (референс ДДС_image2). */
export function toRangeLabel(pageIndex: number, pageSize: number, total: number): string {
  if (total === 0) return "0 из 0";
  const first = pageIndex * pageSize + 1;
  const last = Math.min(total, first + pageSize - 1);
  return `${first}-${last} из ${total}`;
}
