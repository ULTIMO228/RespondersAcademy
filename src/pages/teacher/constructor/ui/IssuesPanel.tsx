"use client";

import { forwardRef, useState } from "react";

import type { FlowHistoryEntry, FlowValidationReport } from "@/entities/scenario-flow";
import { formatHourMinute } from "@/shared/lib";
import { PlatformButton } from "@/shared/ui/platform";

import styles from "./ConstructorScreen.module.css";

type IssuesPanelProps = {
  report: FlowValidationReport;
  checkedAt: Date | null;
  log: { label: string; at: string }[];
  past: FlowHistoryEntry[];
  tab: "issues" | "history";
  onTab: (tab: "issues" | "history") => void;
  onShow: (nodeId: string) => void;
};

/** Нижняя панель (design-concept.md §9): «Проверка» со ссылками на блоки и «История изменений» за сеанс. */
export const IssuesPanel = forwardRef<HTMLElement, IssuesPanelProps>(function IssuesPanel(
  { report, checkedAt, log, past, tab, onTab, onShow },
  ref,
) {
  const [collapsed, setCollapsed] = useState(false);
  const issues = [...report.errors, ...report.warnings];
  return (
    <section
      ref={ref}
      className={[styles.panel, collapsed ? styles["panel--collapsed"] : ""].filter(Boolean).join(" ")}
      aria-label="Проверка и история"
      tabIndex={-1}
    >
      <div className={styles.panel__tabs} role="tablist" aria-label="Нижняя панель">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "issues"}
          className={styles.panel__tab}
          onClick={() => onTab("issues")}
        >
          Проверка
          {report.errors.length ? (
            <span className={styles["count--error"]}>
              {report.errors.length} {plural(report.errors.length, "ошибка", "ошибки", "ошибок")}
            </span>
          ) : null}
          {report.warnings.length ? (
            <span className={styles["count--warning"]}>
              {report.warnings.length}{" "}
              {plural(report.warnings.length, "предупреждение", "предупреждения", "предупреждений")}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "history"}
          className={styles.panel__tab}
          onClick={() => onTab("history")}
        >
          История изменений
        </button>
        <span className={styles.panel__meta}>
          {checkedAt
            ? `Проверено в ${formatHourMinute(checkedAt.toISOString())} · `
            : "Проверка идёт сама после каждой правки · "}
          путей: {report.stats.paths} · максимум баллов: {report.stats.maxScore}
        </span>
        <PlatformButton
          variant="ghost"
          className={styles.button}
          onClick={() => setCollapsed((value) => !value)}
          aria-expanded={!collapsed}
        >
          {collapsed ? "Развернуть" : "Свернуть"}
        </PlatformButton>
      </div>
      {collapsed ? null : tab === "issues" ? (
        issues.length ? (
          <ul className={styles.issues} role="tabpanel" aria-label="Проверка">
            {issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.nodeId ?? ""}-${index}`}>
                <span
                  className={
                    issue.level === "error" ? styles["issueIcon--error"] : styles["issueIcon--warning"]
                  }
                  aria-label={issue.level === "error" ? "Ошибка" : "Предупреждение"}
                >
                  !
                </span>
                <span className={styles.issues__text}>{issue.message}</span>
                {issue.nodeId ? (
                  <PlatformButton className={styles.button} onClick={() => onShow(issue.nodeId!)}>
                    Показать на схеме
                  </PlatformButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.ok} role="tabpanel">
            <span className={styles.issueIcon} aria-hidden="true">
              ✓
            </span>
            <b>Ошибок нет.</b> Путей прохождения: {report.stats.paths} · максимум баллов:{" "}
            {report.stats.maxScore}. Можно запускать тест.
          </p>
        )
      ) : log.length ? (
        <ol className={styles.history} role="tabpanel" aria-label="История изменений">
          {log.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span className={styles.history__time}>{formatHourMinute(entry.at)}</span> {entry.label}
            </li>
          ))}
          <li className={styles.history__note}>
            Отменить можно последние {past.length} из 50 шагов (Ctrl + Z).
          </li>
        </ol>
      ) : (
        <p className={styles.ok} role="tabpanel">
          Изменений пока нет. Каждая правка появится здесь, её можно отменить кнопкой «Отменить».
        </p>
      )}
    </section>
  );
});

function plural(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
