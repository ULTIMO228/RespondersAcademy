"use client";

import { useEffect, useState } from "react";

import { ApiError } from "@/shared/api";
import type { SystemMonitoring, UsageStats, UsageStatsPeriodId } from "@/shared/api";

import type { SystemApi } from "../api/systemApi";
import { defaultSystemApi } from "../api/systemApi";
import type { LoadState } from "./types";

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить данные мониторинга. Повторите попытку";

function toError<TData>(error: unknown): LoadState<TData> {
  const isOffline = error instanceof ApiError && error.status === NETWORK_STATUS;
  return { status: "error", message: error instanceof ApiError ? error.message : FALLBACK_ERROR, isOffline };
}

/** Ряды нагрузки за сутки (T4.2-12): CPU/память/сеть, сессии и отклик против нормативов ТЗ §7. */
export function useMonitoring(api: SystemApi = defaultSystemApi): LoadState<{ data: SystemMonitoring }> {
  const [state, setState] = useState<LoadState<{ data: SystemMonitoring }>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    api.getMonitoring(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toError(error));
      },
    );
    return () => controller.abort();
  }, [api]);
  return state;
}

/** Статистика использования (T4.2-14): смена периода перезапрашивает ряды из мок-API. */
export function useUsageStats(
  period: UsageStatsPeriodId,
  api: SystemApi = defaultSystemApi,
): LoadState<{ data: UsageStats }> {
  const [state, setState] = useState<LoadState<{ data: UsageStats }>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    api.getUsageStats({ period }, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toError(error));
      },
    );
    return () => controller.abort();
  }, [api, period]);
  return state;
}
