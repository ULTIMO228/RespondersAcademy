"use client";

import { useState } from "react";

import { describeSource, formatUptime, listCriticalEvents } from "@/entities/system";
import type { SystemMonitoring } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import { defaultSystemApi } from "../api/systemApi";
import { describeLoadPeaks } from "../model/buildLoadCharts";

import styles from "./ErrorReportButton.module.css";

type ErrorReportButtonProps = {
  monitoring: SystemMonitoring;
  api?: SystemApi;
};

const REPORT_WIDTH = 640;
/** Мок-индикация времени формирования отчёта (ТЗ §7 — норматив для бэкенда, здесь заглушка). */
const MOCK_BUILD_SEC = 3;

type ReportData = { lines: string[]; errors: string[] };

/** «Сформировать отчёт об ошибках и сбоях» (T4.2-13): выжимка ERROR-событий и аптайма сервисов. */
export function ErrorReportButton({ monitoring, api = defaultSystemApi }: ErrorReportButtonProps) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [isBuilding, setBuilding] = useState(false);

  const build = async () => {
    setBuilding(true);
    try {
      const [{ services }, logs] = await Promise.all([api.getServices(), api.getLogs()]);
      const errors = listCriticalEvents(logs).map(
        (entry) =>
          `${formatDateTime(entry.at)} — ${describeSource(services, entry.source)}: ${entry.message}`,
      );
      setReport({
        lines: [
          `Данные на ${formatDateTime(monitoring.generatedAt)}, окно ${monitoring.windowHours} ч`,
          `Ошибок уровня ERROR в журналах: ${errors.length}`,
          ...describeLoadPeaks(monitoring),
          ...services.map((service) => `${service.name}: аптайм ${formatUptime(service.uptimeSec)}`),
        ],
        errors,
      });
    } finally {
      setBuilding(false);
    }
  };

  return (
    <>
      <Button variant="primary" disabled={isBuilding} onClick={build}>
        Сформировать отчёт об ошибках и сбоях
      </Button>
      {report ? (
        <Modal title="Отчёт об ошибках и сбоях" onClose={() => setReport(null)} width={REPORT_WIDTH}>
          <ul className={styles.report}>
            {report.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <h4 className={styles.report__title}>События уровня ERROR</h4>
          <ul className={styles.report}>
            {report.errors.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {report.errors.length === 0 ? <li>Ошибок за период хранения журналов нет</li> : null}
          </ul>
          <p className={styles.report__note}>
            Отчёт сформирован за {MOCK_BUILD_SEC} с — мок-индикация (норматив ТЗ §7 проверяется на бэкенде).
          </p>
        </Modal>
      ) : null}
    </>
  );
}
