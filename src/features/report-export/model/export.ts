/*
 * Экспорт отчёта (T3.4-16, T3.4-17): CSV — файл собирается на клиенте из тех же данных, что и таблица
 * на экране; PDF — системная печать print-вёрстки (`@media print`). Сохранение файла и печать спрятаны
 * за интерфейсами (spec/10-code-rules.md §6) и подменяются в тестах.
 */
import { toCsv } from "../lib/csv";
import type { CsvCell } from "../lib/csv";

export const CSV_MIME = "text/csv;charset=utf-8";

export interface FileSaver {
  save(file: Blob, fileName: string): void;
}

export interface Printer {
  print(): void;
}

/** Таблица экспорта: подписи колонок и строки в том же порядке, что на экране. */
export type CsvTable = {
  fileName: string;
  header: readonly string[];
  rows: readonly (readonly CsvCell[])[];
};

export const browserFileSaver: FileSaver = {
  save(file, fileName) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};

export const browserPrinter: Printer = {
  print: () => window.print(),
};

/** Имя файла экспорта: раздел, id занятия и дата — «otchet-ses-2026-09-16-01-2026-09-16.csv». */
export function buildExportFileName(sessionId: string, isoDate: string, extension: string): string {
  const datePart = isoDate.slice(0, "2026-09-16".length);
  return `otchet-${sessionId}-${datePart}.${extension}`;
}

export function downloadCsv(table: CsvTable, saver: FileSaver = browserFileSaver): void {
  const csv = toCsv([table.header, ...table.rows]);
  saver.save(new Blob([csv], { type: CSV_MIME }), table.fileName);
}
