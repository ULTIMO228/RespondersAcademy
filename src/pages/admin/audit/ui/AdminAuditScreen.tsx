"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { ROLE_TITLES } from "@/entities/user";
import type { AuditEventType, AuditLogEntry, AuditLogQuery, PublicUser } from "@/shared/api";
import { AUDIT_EVENT_TYPES, AUDIT_EVENT_TYPE_TITLES, describeAuditAction } from "@/shared/config";
import { formatDate, formatTime } from "@/shared/lib";
import {
  Card,
  DataTable,
  Field,
  PageHeader,
  Pagination,
  PlatformButton,
  ResourceView,
  SelectField,
  useResource,
} from "@/shared/ui/platform";
import type { DataColumn } from "@/shared/ui/platform";

import { adminAuditApi } from "../api/auditApi";
import type { AdminAuditApi } from "../api/auditApi";

import styles from "./AdminAudit.module.css";

const PER_PAGE = 20;

type Filters = {
  type: AuditEventType | "";
  operator: string;
  card: string;
  q: string;
  from: string;
  to: string;
};
const EMPTY: Filters = { type: "", operator: "", card: "", q: "", from: "", to: "" };

/** Только заполненные фильтры: именно эти query-параметры поддерживает GET /admin/audit (compat/admin_system.py). */
export function toQuery(filters: Filters, page: number): AuditLogQuery {
  const query: AuditLogQuery = { page, perPage: PER_PAGE };
  if (filters.type) query.type = filters.type;
  if (filters.operator.trim()) query.operator = filters.operator.trim();
  if (filters.card.trim()) query.card = filters.card.trim();
  if (filters.q.trim()) query.q = filters.q.trim();
  if (filters.from) query.from = filters.from;
  if (filters.to) query.to = filters.to;
  return query;
}

type AdminAuditScreenProps = { api?: AdminAuditApi };

/** `/admin/audit` — журнал действий: вход, выход, смена пароля, назначения, правки оценок и т. д. */
export function AdminAuditScreen({ api = adminAuditApi }: AdminAuditScreenProps) {
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const audit = useResource((signal) => api.getAudit(toQuery(applied, page), signal), [api, applied, page]);
  const users = useResource((signal) => api.listUsers(signal).catch(() => [] as PublicUser[]), [api]);
  const usersList = users.state.status === "ready" ? users.state.data : [];

  const columns: DataColumn<AuditLogEntry>[] = [
    {
      key: "at",
      title: "Когда",
      render: (row) => `${formatDate(row.at)} ${formatTime(row.at)}`,
    },
    {
      key: "user",
      title: "Пользователь",
      render: (row) => usersList.find((user) => user.id === row.userId)?.fullName ?? row.userId ?? "Система",
    },
    { key: "role", title: "Роль", render: (row) => (row.role ? ROLE_TITLES[row.role] : "—") },
    {
      key: "arm",
      title: "АРМ",
      numeric: true,
      render: (row) => row.operatorArm ?? "—",
    },
    { key: "event", title: "Событие", render: (row) => describeAuditAction(row.action) },
    { key: "details", title: "Описание", render: (row) => row.details },
  ];

  const apply = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setApplied(draft);
  };
  const reset = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setPage(1);
  };

  return (
    <section aria-labelledby="admin-audit-title">
      <PageHeader
        title="Аудит"
        description="Журнал действий пользователей и администраторов"
        actions={
          <PlatformButton variant="secondary" onClick={audit.reload}>
            Обновить
          </PlatformButton>
        }
      />
      <Card>
        <form className={styles.filters} onSubmit={apply} role="search" aria-label="Фильтры журнала">
          <SelectField
            label="Тип события"
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value as Filters["type"] })}
          >
            <option value="">Все события</option>
            {AUDIT_EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {AUDIT_EVENT_TYPE_TITLES[value]}
              </option>
            ))}
          </SelectField>
          <Field
            label="Оператор"
            hint="ФИО, логин или номер АРМ"
            value={draft.operator}
            onChange={(event) => setDraft({ ...draft, operator: event.target.value })}
          />
          <Field
            label="Карточка"
            value={draft.card}
            onChange={(event) => setDraft({ ...draft, card: event.target.value })}
          />
          <Field
            label="Поиск"
            hint="По событию и описанию"
            value={draft.q}
            onChange={(event) => setDraft({ ...draft, q: event.target.value })}
          />
          <Field
            label="С даты"
            type="date"
            value={draft.from}
            onChange={(event) => setDraft({ ...draft, from: event.target.value })}
          />
          <Field
            label="По дату"
            type="date"
            value={draft.to}
            onChange={(event) => setDraft({ ...draft, to: event.target.value })}
          />
          <div className={styles.filters__actions}>
            <PlatformButton type="submit" variant="primary">
              Найти
            </PlatformButton>
            <PlatformButton variant="ghost" onClick={reset}>
              Сбросить
            </PlatformButton>
          </div>
        </form>
      </Card>
      <Card>
        <ResourceView state={audit.state} onRetry={audit.reload} errorTitle="Не удалось загрузить журнал">
          {(data) => (
            <>
              <DataTable
                caption="Журнал аудита"
                columns={columns}
                rows={data.items}
                getRowKey={(row) => row.id}
                emptyText="Событий по этим условиям нет."
              />
              <Pagination page={data.page} perPage={data.perPage} total={data.total} onChange={setPage} />
            </>
          )}
        </ResourceView>
      </Card>
    </section>
  );
}
