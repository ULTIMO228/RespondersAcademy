"use client";

import { useCallback, useEffect, useState } from "react";

import type { SessionControlRequest, SessionControlResponse } from "@/shared/api";

import { useSessionControlApi } from "./deps";

export type ControlStatus = "loading" | "ready" | "busy" | "error";

const FALLBACK_ERROR = "Не удалось выполнить действие";

function toMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_ERROR;
}

/**
 * Состояние управления занятием (T3.2-11): GET /sessions/[id]/control + действия pause/resume/issue/report
 * и «Завершить занятие» (POST /sessions/[id]/stop, доступно в любой момент — ТЗ §10).
 */
export function useSessionControl(sessionId: string) {
  const api = useSessionControlApi();
  const [control, setControl] = useState<SessionControlResponse | null>(null);
  const [status, setStatus] = useState<ControlStatus>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isActive = true;
    api
      .getSessionControl(sessionId)
      .then((loaded) => {
        if (!isActive) return;
        setControl(loaded);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        setStatus("error");
        setMessage(toMessage(error));
      });
    return () => {
      isActive = false;
    };
  }, [api, sessionId]);

  const run = useCallback(
    async (action: () => Promise<SessionControlResponse>) => {
      setStatus("busy");
      setMessage("");
      try {
        setControl(await action());
        setStatus("ready");
      } catch (error: unknown) {
        setStatus("error");
        setMessage(toMessage(error));
      }
    },
    [setControl],
  );

  const send = useCallback(
    (body: SessionControlRequest) => run(() => api.postSessionControl(sessionId, body)),
    [api, run, sessionId],
  );

  const stop = useCallback(
    () =>
      run(async () => {
        await api.stopSession(sessionId);
        return api.getSessionControl(sessionId);
      }),
    [api, run, sessionId],
  );

  return { control, status, message, send, stop };
}
