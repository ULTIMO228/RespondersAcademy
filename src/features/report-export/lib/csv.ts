/*
 * Генерация CSV на клиенте (T3.4-16; ТЗ §12, §6): разделитель «;» и BOM — Excel открывает кириллицу
 * без мастера импорта. Значения экранируются кавычками, перевод строки — CRLF.
 */
export const CSV_DELIMITER = ";";
export const CSV_LINE_BREAK = "\r\n";
/** Метка порядка байтов UTF-8: без неё Excel читает кириллицу как «РџРµС‚СЂРѕРІР°». */
export const CSV_BOM = "﻿";

export type CsvCell = string | number | null | undefined;

const NEEDS_QUOTES = /[;"\n\r]/;

export function escapeCsvCell(value: CsvCell): string {
  const text = value === null || value === undefined ? "" : String(value);
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Таблица → CSV-текст с BOM (строки — массивы ячеек в порядке колонок). */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  const body = rows.map((row) => row.map(escapeCsvCell).join(CSV_DELIMITER)).join(CSV_LINE_BREAK);
  return `${CSV_BOM}${body}${CSV_LINE_BREAK}`;
}
