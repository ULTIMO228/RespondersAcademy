"use client";

import { ArmIcon, Button } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import { AUDIT_PAGE_SIZE, useAuditJournal } from "../model/useAuditJournal";
import { AuditFilters } from "./AuditFilters";
import { AuditTable } from "./AuditTable";

import styles from "./AuditJournal.module.css";

type AuditJournalProps = {
  api?: SystemApi;
};

/** «Журнал аудита» по образцу экрана «аудит» ПОВ-112 (ИНСТРУКЦИЯ_image114): фильтры и пагинация. */
export function AuditJournal({ api }: AuditJournalProps) {
  const { state, query, page, search, setPage } = useAuditJournal(api);
  const total = state.status === "ready" ? state.total : 0;
  const rows = state.status === "ready" ? state.rows : [];
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const first = (page - 1) * AUDIT_PAGE_SIZE;
  return (
    <section className={styles.journal} aria-label="Журнал аудита">
      <AuditFilters query={query} onSearch={search} />
      {state.status === "error" ? (
        <div className={styles.journal__area} role="alert">
          <p>{state.isOffline ? "Нет соединения с сервером — журнал недоступен" : state.message}</p>
          <Button size="sm" onClick={() => search(query)}>
            Повторить
          </Button>
        </div>
      ) : (
        <div className={styles.journal__area}>
          {state.status === "loading" ? <p role="status">Загрузка журнала…</p> : <AuditTable rows={rows} />}
          <footer className={styles.journal__pager}>
            <span>Страница: {page}</span>
            <span>Записей на странице: {AUDIT_PAGE_SIZE}</span>
            <span>
              {total === 0 ? 0 : first + 1}-{first + rows.length} из {total}
            </span>
            <button
              type="button"
              className={styles.journal__arrow}
              aria-label="Предыдущая страница"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              <ArmIcon name="pagination-prev" size={16} />
            </button>
            <button
              type="button"
              className={styles.journal__arrow}
              aria-label="Следующая страница"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              <ArmIcon name="pagination-next" size={16} />
            </button>
          </footer>
        </div>
      )}
    </section>
  );
}
