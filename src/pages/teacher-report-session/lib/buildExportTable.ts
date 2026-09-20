/*
 * Данные экспорта CSV (T3.4-16): те же строки и значения, что в сводной таблице на экране —
 * один источник, поэтому файл и экран не расходятся.
 */
import { buildExportFileName } from "@/features/report-export";
import type { CsvTable } from "@/features/report-export";

import type { SummaryRow } from "../model/types";

export const EXPORT_HEADER = [
  "ФИО",
  "№ АРМ",
  "Карточек отработано",
  "Средняя реакция, с",
  "Отклонение от 30 с",
  "Средняя отработка, с",
  "Отклонение от 180 с",
  "Грамматических ошибок",
  "Интегральный балл",
] as const;

const EMPTY_VALUE = "—";

export function buildExportTable(sessionId: string, isoDate: string, rows: SummaryRow[]): CsvTable {
  return {
    fileName: buildExportFileName(sessionId, isoDate, "csv"),
    header: [...EXPORT_HEADER],
    rows: rows.map((row) => [
      row.fullName,
      row.armNumber,
      row.cardCount,
      row.reactionSec ?? EMPTY_VALUE,
      row.reactionDeviation,
      row.processingSec ?? EMPTY_VALUE,
      row.processingDeviation,
      row.grammarCount,
      row.score,
    ]),
  };
}
