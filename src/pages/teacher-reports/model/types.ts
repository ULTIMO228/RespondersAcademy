import type { ReportJournalFilters, ReportJournalRow } from "@/shared/api";

/** Значения фильтров журнала: период (даты), группа, курсант, категория (spec/000-фронт/04-pages/13). */
export type JournalFilter = {
  from: string;
  to: string;
  group: string;
  studentId: string;
  category: string;
};

export const EMPTY_JOURNAL_FILTER: JournalFilter = {
  from: "",
  to: "",
  group: "",
  studentId: "",
  category: "",
};

export type JournalState =
  | { status: "loading" }
  | { status: "ready"; rows: ReportJournalRow[]; filters: ReportJournalFilters }
  | { status: "error"; message: string; isOffline: boolean };

export const REPORT_READY_STATUS = "отчёт сформирован";
export const REPORT_DRAFT_STATUS = "черновик";
