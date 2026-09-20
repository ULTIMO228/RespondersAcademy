"use client";

import { useEffect, useState } from "react";

import type { SystemLogEntry, SystemLogLevel } from "@/shared/api";

import type { SystemApi } from "../api/systemApi";
import { defaultSystemApi } from "../api/systemApi";

const MS_IN_SEC = 1000;

export type LogLevelFilter = SystemLogLevel | "ALL";

/**
 * Системные журналы (T4.2-23): фильтр уровня выполняет мок-API, лента сама обновляется
 * по интервалу опроса из настроек `performance.refreshIntervalSec`.
 */
export function useSystemLogs(
  level: LogLevelFilter,
  refreshIntervalSec: number,
  initial: SystemLogEntry[],
  api: SystemApi = defaultSystemApi,
): SystemLogEntry[] {
  const [logs, setLogs] = useState<SystemLogEntry[]>(initial);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api.getLogs(level === "ALL" ? undefined : { level }, controller.signal).then(
      (next) => {
        if (!controller.signal.aborted) setLogs(next);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api, level, tick]);

  useEffect(() => {
    if (refreshIntervalSec <= 0) return undefined;
    const timerId = window.setInterval(() => setTick((value) => value + 1), refreshIntervalSec * MS_IN_SEC);
    return () => window.clearInterval(timerId);
  }, [refreshIntervalSec]);

  return logs;
}
