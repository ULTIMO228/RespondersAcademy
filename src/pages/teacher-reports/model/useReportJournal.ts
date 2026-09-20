"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api";

import { defaultJournalApi } from "../api/journalApi";
import type { JournalApi } from "../api/journalApi";
import { EMPTY_JOURNAL_FILTER } from "./types";
import type { JournalFilter, JournalState } from "./types";

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить журнал отчётов. Повторите попытку";

function toErrorState(error: unknown): JournalState {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, isOffline: error.status === NETWORK_STATUS };
  }
  return { status: "error", message: FALLBACK_ERROR, isOffline: false };
}

/**
 * Журнал занятий преподавателя: фильтры уходят в query мок-API (`GET /reports/journal`), значения
 * фильтров приходят оттуда же — без хардкода групп и курсантов в UI. Сброс возвращает весь журнал.
 */
export function useReportJournal(teacherId: string, api: JournalApi = defaultJournalApi) {
  const [filter, setFilter] = useState<JournalFilter>(EMPTY_JOURNAL_FILTER);
  const [state, setState] = useState<JournalState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    api.getReportJournal({ teacherId, ...filter }, controller.signal).then(
      (response) => {
        if (controller.signal.aborted) return;
        setState({ status: "ready", rows: response.rows, filters: response.filters });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState(toErrorState(error));
      },
    );
    return () => controller.abort();
  }, [api, teacherId, filter]);

  const updateFilter = useCallback((patch: Partial<JournalFilter>) => {
    setFilter((current) => ({ ...current, ...patch }));
  }, []);

  const resetFilter = useCallback(() => setFilter(EMPTY_JOURNAL_FILTER), []);

  return { state, filter, updateFilter, resetFilter };
}
