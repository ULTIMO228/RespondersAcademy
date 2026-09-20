"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api";

import { loadSessionReport } from "../api/loadSessionReport";
import type { SessionReportData } from "../api/loadSessionReport";
import { defaultReportApi } from "../api/reportApi";
import type { ReportApi } from "../api/reportApi";

export type SessionReportState =
  | { status: "loading" }
  | { status: "ready"; data: SessionReportData }
  | { status: "error"; message: string; isOffline: boolean };

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось сформировать отчёт. Повторите попытку";

function toErrorState(error: unknown): SessionReportState {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, isOffline: error.status === NETWORK_STATUS };
  }
  return { status: "error", message: FALLBACK_ERROR, isOffline: false };
}

/**
 * Отчёт о занятии из мок-API. `reload` перечитывает данные после действий преподавателя
 * (правка оценки, обратная связь) — итоговые баллы и графики пересчитывает мок-слой, не UI.
 */
export function useSessionReport(sessionId: string, api: ReportApi = defaultReportApi) {
  const [state, setState] = useState<SessionReportState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loadSessionReport(sessionId, api, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toErrorState(error));
      },
    );
    return () => controller.abort();
  }, [api, sessionId, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);

  return { state, reload };
}
