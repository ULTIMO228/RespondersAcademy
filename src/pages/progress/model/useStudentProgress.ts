"use client";

import { useCallback, useEffect, useState } from "react";

import { useAuthSession } from "@/entities/user";
import { ApiError } from "@/shared/api";

import { defaultProgressApi, loadStudentProgress } from "../api/progressApi";
import type { ProgressApi } from "../api/progressApi";
import { selectStudentProgress } from "../lib/selectStudentProgress";
import type { StudentProgress } from "../lib/selectStudentProgress";

export type ProgressState =
  | { status: "loading" }
  | { status: "noSession" }
  | { status: "ready"; progress: StudentProgress }
  | { status: "error"; message: string; isOffline: boolean };

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить результаты. Повторите попытку";

function toErrorState(error: unknown): ProgressState {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, isOffline: error.status === NETWORK_STATUS };
  }
  return { status: "error", message: FALLBACK_ERROR, isOffline: false };
}

/**
 * Прогресс курсанта сессии: studentId — только из useAuthSession (не из URL/пропсов), мок-API сверяет его
 * с cookie-сессией. Состояния loading / ready / error (офлайн — status 0) и повтор загрузки.
 */
export function useStudentProgress(api: ProgressApi = defaultProgressApi) {
  const studentId = useAuthSession()?.userId ?? null;
  const [state, setState] = useState<ProgressState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!studentId) return undefined;
    const controller = new AbortController();
    loadStudentProgress(studentId, api, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", progress: selectStudentProgress(data) });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toErrorState(error));
      },
    );
    return () => controller.abort();
  }, [api, studentId, attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }, []);

  return { state: studentId ? state : ({ status: "noSession" } as const), retry };
}
