/*
 * Store отчётов:
 *   - обратная связь преподавателя по отчётам (T3.4-10): в reports.json её нет — запись рантаймовая,
 *     одна на отчёт (повторная отправка заменяет предыдущую);
 *   - отчёты занятий, проведённых в этом процессе: формируются по попыткам (reports-runtime.ts),
 *     пишутся один раз на занятие и дальше только читаются (правки — в Evaluation попытки и feedback).
 * Отдаёт копии, как остальные модули store-*.
 */
import type { GroupReport, Report, ReportFeedback } from "../types";
import { cloneOut, getMockState } from "./store";

export function listStoredFeedback(): ReportFeedback[] {
  return cloneOut(getMockState().reportFeedback);
}

export function findStoredFeedback(reportId: string): ReportFeedback | undefined {
  const entry = getMockState().reportFeedback.find((candidate) => candidate.reportId === reportId);
  return entry && cloneOut(entry);
}

/** Вставка или замена обратной связи по отчёту. */
export function upsertStoredFeedback(feedback: ReportFeedback): ReportFeedback {
  const { reportFeedback } = getMockState();
  const index = reportFeedback.findIndex((candidate) => candidate.reportId === feedback.reportId);
  if (index < 0) reportFeedback.push(cloneOut(feedback));
  else reportFeedback[index] = cloneOut(feedback);
  return cloneOut(feedback);
}

/* ─── Отчёты занятий, сформированные по рантайм-данным (см. reports-runtime.ts) ────────────────── */

export function listStoredReports(): Report[] {
  return cloneOut(getMockState().reports);
}

export function findStoredReport(reportId: string): Report | undefined {
  const report = getMockState().reports.find((candidate) => candidate.id === reportId);
  return report && cloneOut(report);
}

/** Отчёты одного занятия в порядке формирования (пустой список — отчёт ещё не формировался). */
export function listStoredSessionReports(sessionId: string): Report[] {
  return cloneOut(getMockState().reports.filter((report) => report.sessionId === sessionId));
}

export function findStoredGroupReport(sessionId: string): GroupReport | undefined {
  const groupReport = getMockState().groupReports.find((candidate) => candidate.sessionId === sessionId);
  return groupReport && cloneOut(groupReport);
}

/**
 * Запись сформированного отчёта занятия. Идемпотентность: занятие с уже записанным сводом
 * повторно не формируется — вызывающий проверяет `findStoredGroupReport` до сборки.
 */
export function insertStoredSessionReport(reports: readonly Report[], groupReport: GroupReport): void {
  const state = getMockState();
  if (state.groupReports.some((candidate) => candidate.sessionId === groupReport.sessionId)) return;
  state.reports.push(...cloneOut([...reports]));
  state.groupReports.push(cloneOut(groupReport));
}
