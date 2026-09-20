/* Данные журнала отчётов: GET /reports/journal через клиент @/shared/api (в тестах подменяется). */
import { getReportJournal } from "@/shared/api";
import type { ReportJournalQuery, ReportJournalResponse } from "@/shared/api";

export type JournalApi = {
  getReportJournal: (query?: ReportJournalQuery, signal?: AbortSignal) => Promise<ReportJournalResponse>;
};

export const defaultJournalApi: JournalApi = { getReportJournal };
