"use client";

import { useCallback, useEffect, useState } from "react";

import { collectCallLog, compareByStartDesc } from "@/features/call-control";
import type { CallLogEntry } from "@/features/call-control";
import type { InternalNumber } from "@/shared/api";

import { defaultPhoneApi } from "../api/phoneApi";
import type { PhoneApi } from "../api/phoneApi";
import { toErrorState } from "./loadState";
import type { LoadState } from "./loadState";

/**
 * Журнал вызовов курсанта: PhoneCall из попыток его занятий (GET /sessions?studentId=) + вызовы этой
 * вкладки (прямые и не записанные в попытку). Новые — сверху.
 */
export function useCallJournal(
  studentId: string | null,
  numbers: readonly InternalNumber[],
  api: PhoneApi = defaultPhoneApi,
) {
  const [state, setState] = useState<LoadState<CallLogEntry[]>>({ status: "loading" });
  const [added, setAdded] = useState<CallLogEntry[]>([]);

  useEffect(() => {
    if (!studentId || numbers.length === 0) return undefined;
    const controller = new AbortController();
    api.listStudentSessions(studentId, controller.signal).then(
      (sessions) =>
        !controller.signal.aborted &&
        setState({ status: "ready", data: collectCallLog(sessions, studentId, numbers) }),
      (error: unknown) => !controller.signal.aborted && setState(toErrorState(error)),
    );
    return () => controller.abort();
  }, [studentId, numbers, api]);

  const add = useCallback((entry: CallLogEntry) => setAdded((current) => [entry, ...current]), []);
  const loaded = state.status === "ready" ? state.data : [];
  const loadedIds = new Set(loaded.map((entry) => entry.id));
  const entries = [...added.filter((entry) => !loadedIds.has(entry.id)), ...loaded].sort(compareByStartDesc);
  return { state: studentId ? state : ({ status: "ready", data: [] } as const), entries, add };
}
