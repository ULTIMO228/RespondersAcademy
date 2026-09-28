"use client";

import type { SessionErrorSummaryResponse } from "@/shared/api";
import { Chip, Panel } from "@/shared/ui";

import type { AttemptView } from "../model/types";
import styles from "./ReportSession.module.css";

export type SessionErrorSummaryPanelProps = {
  summary?: SessionErrorSummaryResponse | null;
  attempts: AttemptView[];
};

const DETECTOR_NAMES: Record<string, string> = {
  rule: "Правило",
  ml: "ML-модель",
  llm_confirmed: "Подтверждено LLM",
  teacher: "Преподаватель",
};

export function SessionErrorSummaryPanel({ summary, attempts }: SessionErrorSummaryPanelProps) {
  // Вычисляем из attempts, если серверная сводка не поступила
  const allIssues = attempts.flatMap((a) => a.issues);
  const total = summary ? summary.totalErrors : allIssues.length;
  const critical = summary ? summary.critical : allIssues.filter((i) => i.severity === "critical").length;
  const major = summary ? summary.major : allIssues.filter((i) => i.severity === "major").length;
  const minor = summary ? summary.minor : allIssues.filter((i) => i.severity === "minor").length;

  return (
    <Panel title="Сводка ошибок (AI-контроль)" headerTone="dark">
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", marginBottom: "12px" }}
      >
        <div>
          <strong>Всего ошибок:</strong> {total}
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <Chip
            className={styles.report__chip}
            style={{ borderLeft: "3px solid var(--color-status-danger, #ef4444)" }}
          >
            Критических: {critical}
          </Chip>
          <Chip
            className={styles.report__chip}
            style={{ borderLeft: "3px solid var(--color-status-warning, #f59e0b)" }}
          >
            Значительных: {major}
          </Chip>
          <Chip
            className={styles.report__chip}
            style={{ borderLeft: "3px solid var(--color-status-info, #3b82f6)" }}
          >
            Незначительных: {minor}
          </Chip>
        </div>
      </div>

      {summary && Object.keys(summary.byDetector).length > 0 ? (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
            fontSize: "0.875rem",
            color: "var(--color-ink-muted)",
          }}
        >
          <span>
            <strong>Детекторы:</strong>
          </span>
          {Object.entries(summary.byDetector).map(([det, count]) => (
            <span key={det} style={{ marginRight: "8px" }}>
              {DETECTOR_NAMES[det] || det}: {count}
            </span>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}
