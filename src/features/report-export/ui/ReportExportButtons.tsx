"use client";

import { Button } from "@/shared/ui";

import { browserFileSaver, browserPrinter, downloadCsv } from "../model/export";
import type { CsvTable, FileSaver, Printer } from "../model/export";

import styles from "./ReportExportButtons.module.css";

type ReportExportButtonsProps = {
  /** Данные CSV — те же строки, что в сводной таблице на экране (один источник). */
  table: CsvTable;
  saver?: FileSaver;
  printer?: Printer;
};

/**
 * Кнопки экспорта отчёта: CSV — сводная таблица, PDF — печать отчёта целиком (print-вёрстка).
 * В печати блок скрыт (`.export--screenOnly`), чтобы кнопки не попадали на страницу PDF.
 */
export function ReportExportButtons({
  table,
  saver = browserFileSaver,
  printer = browserPrinter,
}: ReportExportButtonsProps) {
  return (
    <div className={styles.export}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadCsv(table, saver)}
        title="Сводная таблица в CSV (разделитель «;», кириллица в UTF-8 с BOM)"
      >
        Скачать CSV
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => printer.print()}
        title="Отчёт целиком: системная печать, «Сохранить как PDF»"
      >
        Скачать PDF
      </Button>
    </div>
  );
}
