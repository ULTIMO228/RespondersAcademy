import Link from "next/link";
import type { ReactNode } from "react";

import { getModeTitle } from "@/entities/session";
import type { ReportJournalRow } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate } from "@/shared/lib";

import { REPORT_NORM_SEC } from "../config/report";

import styles from "./ReportSession.module.css";

type ReportHeaderProps = {
  row: ReportJournalRow;
  /** Кнопки экспорта (CSV/PDF) — в печати скрываются. */
  children?: ReactNode;
};

/**
 * 1. Шапка отчёта: дата, преподаватель, категории, режим и индикация «Отчёт сформирован за N сек».
 * N мок-слой считает честно: `generatedAt` отчёта минус завершение занятия (ТЗ §7 — не более 30 с).
 */
export function ReportHeader({ row, children }: ReportHeaderProps) {
  const isNormExceeded = row.buildSec !== null && row.buildSec > REPORT_NORM_SEC;
  return (
    <header className={styles.report__header}>
      <div className={styles.report__headerMain}>
        <Link href={ROUTES.teacherReports} className={styles.report__back}>
          К журналу отчётов
        </Link>
        <h1 className={styles.report__title}>Отчёт о практическом занятии {formatDate(row.startedAt)}</h1>
        <dl className={styles.report__meta}>
          <dt>Занятие</dt>
          <dd>{row.sessionId}</dd>
          <dt>Преподаватель</dt>
          <dd>{row.teacherName}</dd>
          <dt>Режим</dt>
          <dd>{getModeTitle(row.mode)}</dd>
          <dt>Категории</dt>
          <dd>{row.categories.join("; ")}</dd>
        </dl>
      </div>
      <div className={styles.report__headerSide}>
        {row.buildSec === null ? (
          <p className={styles.report__built}>
            Отчёт ещё не сформирован
            <span className={styles.report__builtNorm}>занятие не завершено</span>
          </p>
        ) : (
          <p className={styles.report__built} data-build-sec={row.buildSec}>
            Отчёт сформирован за {row.buildSec} сек
            <span className={isNormExceeded ? styles["report__builtNorm--bad"] : styles.report__builtNorm}>
              {isNormExceeded ? "норматив превышен" : `норматив ≤ ${REPORT_NORM_SEC} сек`}
            </span>
          </p>
        )}
        {children}
      </div>
    </header>
  );
}
