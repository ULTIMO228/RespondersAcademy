"use client";

import { useCallback, useEffect, useState } from "react";

import { resolveTimeNorms } from "@/entities/session";
import type { TimeNormsMs } from "@/entities/session";
import { ApiError } from "@/shared/api";
import type { SessionContract } from "@/shared/api";

import { useMonitorDeps } from "./deps";
import type { MonitorApi } from "./deps";

export type LiveSession = {
  session: SessionContract;
  /** Выдача новых карточек приостановлена преподавателем (T3.2-11). */
  isIssuePaused: boolean;
  /** Нормативы занятия: из настроек мастера, иначе дефолты заказчика 30/180. */
  norms: TimeNormsMs;
};

export type LiveSessionState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "ready"; live: LiveSession }
  | { status: "error"; message: string };

const LOAD_ERROR = "Не удалось загрузить занятие. Повторите попытку";
const RUNNING = "running";

/** Занятие + настройки выдачи: GET /sessions/[id]/control; недоступен — занятие из списка и дефолты. */
async function loadLive(
  api: MonitorApi,
  session: SessionContract,
  signal: AbortSignal,
): Promise<LiveSession> {
  try {
    const control = await api.getSessionControl(session.id, signal);
    return {
      session: control.session,
      isIssuePaused: control.paused,
      norms: resolveTimeNorms(control.plan ? { timeNorms: control.plan.timeNorms } : null),
    };
  } catch {
    return { session, isIssuePaused: false, norms: resolveTimeNorms(null) };
  }
}

/**
 * Идущее занятие преподавателя (T3.3-03): GET /sessions?teacherId=&state=running из рантайм-стора мок-слоя,
 * поэтому занятие мастера (T3.2) видно сразу. Нет идущего — «empty» (заглушка с переходом в мастер).
 * reload() перечитывает занятие после завершения и после новых событий ленты.
 */
export function useLiveSession(teacherId: string | null): { state: LiveSessionState; reload: () => void } {
  const { api } = useMonitorDeps();
  const [state, setState] = useState<LiveSessionState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((current) => current + 1), []);

  useEffect(() => {
    if (!teacherId) return undefined;
    const controller = new AbortController();
    const { signal } = controller;
    void (async () => {
      try {
        const [session] = await api.listSessions({ teacherId, state: RUNNING }, signal);
        if (signal.aborted) return;
        if (!session) {
          setState({ status: "empty" });
          return;
        }
        const live = await loadLive(api, session, signal);
        if (!signal.aborted) setState({ status: "ready", live });
      } catch (error) {
        if (signal.aborted) return;
        setState({ status: "error", message: error instanceof ApiError ? error.message : LOAD_ERROR });
      }
    })();
    return () => controller.abort();
  }, [api, teacherId, attempt]);

  return { state, reload };
}
