"use client";

import Link from "next/link";

import type { ReportJournalRow } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDate } from "@/shared/lib";
import { Button, Panel, StatusChip, Table } from "@/shared/ui";
import type { TableColumn } from "@/shared/ui";

import type { JournalApi } from "../api/journalApi";
import { REPORT_DRAFT_STATUS, REPORT_READY_STATUS } from "../model/types";
import { useReportJournal } from "../model/useReportJournal";
import { JournalFilters } from "./JournalFilters";

import styles from "./TeacherReportsPage.module.css";

type ReportsJournalProps = {
  /** Преподаватель сессии: в журнале — только его занятия (spec/000-фронт/02-roles.md). */
  teacherId: string;
  /** Подмена клиента данных в тестах. */
  api?: JournalApi;
};

const COLUMNS: TableColumn<ReportJournalRow>[] = [
  {
    key: "date",
    title: "Дата",
    render: (row) => (
      <Link href={ROUTES.teacherReport(row.sessionId)} className={styles.reports__link}>
        {formatDate(row.startedAt)}
      </Link>
    ),
  },
  { key: "session", title: "Занятие", render: (row) => row.sessionId },
  { key: "group", title: "Группа", render: (row) => row.groups.join(", ") || "—" },
  { key: "categories", title: "Категории", render: (row) => row.categories.join("; ") || "—" },
  { key: "students", title: "Курсантов", align: "center", render: (row) => row.students.length },
  { key: "score", title: "Средний балл", align: "center", render: (row) => row.averageScore ?? "—" },
  {
    key: "status",
    title: "Статус",
    render: (row) => (
      <StatusChip
        label={row.status === "ready" ? REPORT_READY_STATUS : REPORT_DRAFT_STATUS}
        tone={row.status === "ready" ? "accepted" : "created"}
      />
    ),
  },
];

/** `/teacher/reports` — журнал отчётов преподавателя с фильтрами (T3.4-02, T3.4-03). */
export function ReportsJournal({ teacherId, api }: ReportsJournalProps) {
  const { state, filter, updateFilter, resetFilter } = useReportJournal(teacherId, api);
  if (state.status === "loading") {
    return (
      <Panel title="Прошедшие занятия" headerTone="dark">
        <p className={styles.reports__muted} role="status">
          Загрузка журнала…
        </p>
      </Panel>
    );
  }
  if (state.status === "error") {
    return (
      <Panel title="Прошедшие занятия" headerTone="dark">
        <div className={styles.reports__state} role="alert">
          <p>{state.isOffline ? "Нет соединения с сервером — журнал недоступен" : state.message}</p>
          <Button size="sm" onClick={resetFilter}>
            Повторить
          </Button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel title={`Прошедшие занятия: ${state.rows.length}`} headerTone="dark">
      <JournalFilters filter={filter} options={state.filters} onChange={updateFilter} onReset={resetFilter} />
      <div className={styles.reports__table}>
        <Table
          caption="Журнал отчётов"
          columns={COLUMNS}
          rows={state.rows}
          getRowKey={(row) => row.sessionId}
          emptyText="Занятий в журнале нет"
        />
      </div>
      {state.rows.length === 0 ? (
        <p className={styles.reports__muted} role="status">
          По выбранным фильтрам занятий нет — сбросьте фильтры, чтобы увидеть весь журнал.
        </p>
      ) : null}
    </Panel>
  );
}
