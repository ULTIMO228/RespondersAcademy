"use client";

import { useCallback, useMemo } from "react";

import { ReportExportButtons } from "@/features/report-export";
import type { FileSaver, Printer } from "@/features/report-export";
import { ReportCharts } from "@/widgets/report-charts";
import { Button, Panel } from "@/shared/ui";

import { defaultReportApi } from "../api/reportApi";
import type { ReportApi } from "../api/reportApi";
import { buildAttempts } from "../lib/buildAttempts";
import { buildExportTable } from "../lib/buildExportTable";
import { buildFeedbackTargets } from "../lib/buildFeedbackTargets";
import { buildSummaryRows } from "../lib/buildSummaryRows";
import { useScoreWeights } from "../model/useScoreWeights";
import { useSessionReport } from "../model/useSessionReport";
import { AiVsTeacher } from "./AiVsTeacher";
import type { OverrideDraft } from "./AiVsTeacher";
import { AttemptDetails } from "./AttemptDetails";
import { GroupInsights } from "./GroupInsights";
import { ReportHeader } from "./ReportHeader";
import { ReportSummaryTable } from "./ReportSummaryTable";
import { ScoreWeights } from "./ScoreWeights";
import { SessionErrorSummaryPanel } from "./SessionErrorSummaryPanel";
import { StudentFeedback } from "./StudentFeedback";
import type { FeedbackDraft } from "./StudentFeedback";

import styles from "./ReportSession.module.css";

export type ReportSessionScreenProps = {
  sessionId: string;
  /** Преподаватель сессии: автор правок оценки и обратной связи. */
  teacher: { id: string; fullName: string };
  api?: ReportApi;
  /** Подмены экспорта в тестах. */
  saver?: FileSaver;
  printer?: Printer;
};

/** `/teacher/reports/[sessionId]` — отчёт о занятии на данных мок-API (spec/000-фронт/04-pages/13, п. 1–7). */
export function ReportSessionScreen({
  sessionId,
  teacher,
  api = defaultReportApi,
  saver,
  printer,
}: ReportSessionScreenProps) {
  const { state, reload } = useSessionReport(sessionId, api);
  const { weights, applied, setAxisWeight, reset, sum, isValid } = useScoreWeights();

  const saveOverride = useCallback(
    async (attemptId: string, draft: OverrideDraft) => {
      await api.postAttemptEvaluation(attemptId, { teacherId: teacher.id, ...draft });
      reload();
    },
    [api, reload, teacher.id],
  );

  const sendFeedback = useCallback(
    async (reportId: string, draft: FeedbackDraft) => {
      await api.postReportFeedback({ reportId, teacherId: teacher.id, ...draft });
      reload();
    },
    [api, reload, teacher.id],
  );

  const data = state.status === "ready" ? state.data : null;
  const summaryRows = useMemo(() => buildSummaryRows(data?.reports ?? []), [data]);
  const attempts = useMemo(
    () =>
      data
        ? buildAttempts(data.attempts, {
            reports: data.reports,
            captions: data.captions,
            ddsStatuses: data.ddsStatuses,
            weights: applied,
          })
        : [],
    [data, applied],
  );

  if (state.status === "loading") {
    return (
      <Panel title="Отчёт о занятии" headerTone="dark">
        <p className={styles.report__muted} role="status">
          Формирование отчёта…
        </p>
      </Panel>
    );
  }
  if (state.status === "error") {
    return (
      <Panel title="Отчёт о занятии" headerTone="dark">
        <div className={styles.report__state} role="alert">
          <p>{state.isOffline ? "Нет соединения с сервером — отчёт недоступен" : state.message}</p>
          <Button size="sm" onClick={reload}>
            Повторить
          </Button>
        </div>
      </Panel>
    );
  }
  if (!state.data.row) {
    return <p className={styles.report__empty}>Занятие {sessionId} не найдено.</p>;
  }

  const { row, reports, groupReport } = state.data;
  const hasData = reports.length > 0 && attempts.length > 0;
  return (
    <div className={styles.report}>
      <ReportHeader row={row}>
        <ReportExportButtons
          table={buildExportTable(sessionId, row.startedAt, summaryRows)}
          saver={saver}
          printer={printer}
        />
      </ReportHeader>
      {hasData ? (
        <>
          <ReportSummaryTable rows={summaryRows} />
          <SessionErrorSummaryPanel summary={state.data.errorSummary} attempts={attempts} />
          <ScoreWeights
            weights={weights}
            sum={sum}
            isValid={isValid}
            onChange={setAxisWeight}
            onReset={reset}
          />
          <AttemptDetails attempts={attempts} />
          <div className={styles.report__columns}>
            <AiVsTeacher
              attempts={attempts}
              teacherId={teacher.id}
              teacherName={teacher.fullName}
              onSave={saveOverride}
            />
            <StudentFeedback targets={buildFeedbackTargets(reports)} onSend={sendFeedback} />
          </div>
          {groupReport ? <GroupInsights insights={groupReport.groupInsights} /> : null}
          <ReportCharts reports={reports} groupReport={groupReport} />
        </>
      ) : (
        <p className={styles.report__empty} role="status">
          Нет данных по попыткам: в занятии нет ни одной завершённой попытки — отчёт сформирован с пометкой.
        </p>
      )}
    </div>
  );
}
