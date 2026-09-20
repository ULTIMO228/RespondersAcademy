"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError } from "@/shared/api";
import type { AuditEventType, AuditLogQuery, PublicUser } from "@/shared/api";

import type { SystemApi } from "../api/systemApi";
import { defaultSystemApi } from "../api/systemApi";
import { buildAuditRows } from "./buildAuditRows";
import type { AuditQuery, AuditRow, LoadState } from "./types";
import { EMPTY_AUDIT_QUERY } from "./types";

/** Записей на странице — как на экране «аудит» ПОВ-112. */
export const AUDIT_PAGE_SIZE = 15;

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить журнал аудита. Повторите попытку";
const DATE_RU = /^(\d{2})\.(\d{2})\.(\d{4})$/;

/** «17.09.2026» + «00:00» → ISO с московским смещением; пустая дата — без границы. */
export function toIsoBound(date: string, time: string): string | undefined {
  const match = DATE_RU.exec(date.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const clock = /^\d{2}:\d{2}$/.test(time.trim()) ? `${time.trim()}:00` : "00:00:00";
  return `${year}-${month}-${day}T${clock}+03:00`;
}

/** Форма фильтров ПОВ-112 → query мок-API: чекбоксы задают область поиска «Поиск события». */
export function toAuditQuery(query: AuditQuery, page: number): AuditLogQuery {
  const text = query.text.trim();
  return {
    type: query.type === "" ? undefined : (query.type as AuditEventType),
    operator: query.byOperator && text !== "" ? text : undefined,
    card: query.byCard && text !== "" ? text : undefined,
    q: !query.byOperator && !query.byCard && text !== "" ? text : undefined,
    from: toIsoBound(query.from, "00:00"),
    to: toIsoBound(query.to, "23:59"),
    page,
    perPage: AUDIT_PAGE_SIZE,
  };
}

export type AuditJournalData = { rows: AuditRow[]; total: number; page: number };

export type AuditJournalModel = {
  state: LoadState<AuditJournalData>;
  query: AuditQuery;
  page: number;
  search: (next: AuditQuery) => void;
  setPage: (next: number) => void;
};

/**
 * Журнал аудита (T4.2-22): фильтры и пагинация выполняются мок-API (`GET /admin/audit`),
 * ФИО и № АРМ разрешаются по реестру пользователей.
 */
export function useAuditJournal(api: SystemApi = defaultSystemApi): AuditJournalModel {
  const [query, setQuery] = useState<AuditQuery>(EMPTY_AUDIT_QUERY);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<LoadState<AuditJournalData>>({ status: "loading" });
  const [users, setUsers] = useState<PublicUser[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    api.listUsers(undefined, controller.signal).then(
      (list) => {
        if (!controller.signal.aborted) setUsers(list);
      },
      () => undefined,
    );
    return () => controller.abort();
  }, [api]);

  useEffect(() => {
    const controller = new AbortController();
    api.getAudit(toAuditQuery(query, page), controller.signal).then(
      (response) => {
        if (controller.signal.aborted) return;
        setState({
          status: "ready",
          rows: buildAuditRows(response.items, users),
          total: response.total,
          page: response.page,
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const isOffline = error instanceof ApiError && error.status === NETWORK_STATUS;
        const message = error instanceof ApiError ? error.message : FALLBACK_ERROR;
        setState({ status: "error", message, isOffline });
      },
    );
    return () => controller.abort();
  }, [api, page, query, users]);

  const search = useCallback((next: AuditQuery) => {
    setQuery(next);
    setPage(1);
  }, []);

  return { state, query, page, search, setPage };
}
