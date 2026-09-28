"use client";

import { useState } from "react";

import { MonitorBoard, SessionHeader, useMonitorDeps } from "@/widgets/monitor-grid";
import {
  defaultSessionControlApi,
  SessionFinishBanner,
  SessionFlowControl,
} from "@/features/session-control";
import type { SessionControlApi } from "@/features/session-control";
import { getSessionStateTitle } from "@/entities/session";
import { ApiError } from "@/shared/api";
import type { SessionContract } from "@/shared/api";
import { ConnectionBanner } from "@/shared/ui";

import { useDashboard } from "../model/useDashboard";
import { SessionPlaceholder } from "./SessionPlaceholder";

type DashboardScreenProps = {
  teacherId: string;
  teacherName: string;
  /** Подмена клиента управления занятием (тесты); по умолчанию — мок-слой `/api/mock`. */
  controlApi?: SessionControlApi;
};

const FINISH_ERROR = "Не удалось завершить занятие. Повторите попытку";

/**
 * `/teacher` — мониторинг класса в реальном времени (spec/000-фронт/04-pages/10). Занятие и события приходят из
 * мок-API от имени преподавателя сессии: чужое занятие мок-слой не отдаёт (T3.3-09). Управление занятием:
 * «Завершить занятие» — в шапке (T3.2-11), пауза выдачи и внеочередная карточка — `SessionFlowControl`,
 * переход к отчёту (finished → reported, T3.2-12) — `SessionFinishBanner`.
 */
export function DashboardScreen({
  teacherId,
  teacherName,
  controlApi = defaultSessionControlApi,
}: DashboardScreenProps) {
  const { api } = useMonitorDeps();
  const { state, reload, board } = useDashboard(teacherId, teacherName);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [finished, setFinished] = useState<SessionContract | null>(null);

  async function handleFinish() {
    if (!board) return;
    setFinishError(null);
    try {
      /* Занятие ушло из running: список идущих его уже не вернёт, поэтому завершённое занятие держим
         локально — преподаватель видит итог и переход к отчёту, данные мониторинга остаются на экране. */
      setFinished(await api.stopSession(board.session.id));
    } catch (error) {
      setFinishError(error instanceof ApiError ? error.message : FINISH_ERROR);
    }
  }

  /** Переход к отчёту помечает занятие отчётным (finished → reported, T3.2-12). */
  function handleReport(sessionId: string) {
    controlApi.postSessionControl(sessionId, { action: "report" }).then(
      (control) => setFinished(control.session),
      () => undefined,
    );
  }

  if (!board) return <SessionPlaceholder state={state} onRetry={reload} />;
  const finishedSession = finished && finished.id === board.session.id ? finished : null;
  return (
    <>
      <ConnectionBanner isOnline={board.isOnline} />
      <SessionHeader
        header={finishedSession ? { ...board.header, isFinished: true } : board.header}
        finishedTitle={getSessionStateTitle(finishedSession?.state ?? "finished")}
        onFinish={handleFinish}
        finishError={finishError}
      />
      {finishedSession ? (
        <SessionFinishBanner session={finishedSession} onReport={() => handleReport(finishedSession.id)} />
      ) : (
        <SessionFlowControl
          sessionId={board.session.id}
          students={board.students.length > 0 ? board.students : undefined}
          onChanged={reload}
          api={controlApi}
        />
      )}
      <MonitorBoard
        tiles={board.tiles}
        feedItems={board.feedItems}
        queueItems={board.queueItems}
        isIssuePaused={board.isIssuePaused}
      />
    </>
  );
}
