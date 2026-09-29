"use client";

import { useState } from "react";

import { downloadReportExport } from "@/shared/api";
import type { ReportExportFormat } from "@/shared/api";
import { Button } from "@/shared/ui";

import { browserFileSaver } from "../model/export";
import type { FileSaver } from "../model/export";

import styles from "./ReportExportButtons.module.css";

type ServerExportButtonsProps = {
  /** Id отчёта из `GET /reports`: индивидуального либо группового отчёта занятия. */
  reportId: string;
  download?: (reportId: string, format: ReportExportFormat) => Promise<Blob>;
  saver?: FileSaver;
};

/**
 * Выгрузка отчёта с сервера (CSV с BOM или PDF): файл собирает бэкенд по своим правилам доступа. Отказ (403 —
 * чужой отчёт, 404, нет сервера) показывается сообщением сервера.
 */
export function ServerExportButtons({
  reportId,
  download = downloadReportExport,
  saver = browserFileSaver,
}: ServerExportButtonsProps) {
  const [busy, setBusy] = useState<ReportExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (format: ReportExportFormat) => {
    setBusy(format);
    setError(null);
    try {
      saver.save(await download(reportId, format), `${reportId}.${format}`);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "Не удалось скачать отчёт");
    }
    setBusy(null);
  };

  return (
    <div className={styles.export}>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("csv")}
        title="Отчёт с сервера: строка на попытку, CSV в UTF-8 с BOM"
      >
        CSV с сервера
      </Button>
      <Button
        variant="secondary"
        size="sm"
        disabled={busy !== null}
        onClick={() => void run("pdf")}
        title="Отчёт с сервера в PDF"
      >
        PDF с сервера
      </Button>
      {error ? <span role="alert">{error}</span> : null}
    </div>
  );
}
