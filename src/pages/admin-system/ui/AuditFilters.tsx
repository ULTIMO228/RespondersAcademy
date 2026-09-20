"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { AUDIT_EVENT_TYPE_TITLES, AUDIT_EVENT_TYPES } from "@/shared/config";

import type { AuditQuery } from "../model/types";

import styles from "./AuditFilters.module.css";

type AuditFiltersProps = {
  query: AuditQuery;
  onSearch: (query: AuditQuery) => void;
};

/** Ширина полей периода в символах («24.07.2019», «00:00»). */
const DATE_SIZE = 10;
const TIME_SIZE = 5;

/** Шапка «аудита» ПОВ-112: «Поиск события», «Тип события», «искать», чекбоксы и период. */
export function AuditFilters({ query, onSearch }: AuditFiltersProps) {
  const [draft, setDraft] = useState<AuditQuery>(query);
  useEffect(() => setDraft(query), [query]);
  const patch = (next: Partial<AuditQuery>) => setDraft((current) => ({ ...current, ...next }));
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSearch(draft);
  };
  return (
    <form className={styles.filters} onSubmit={handleSubmit} role="search" aria-label="Поиск события">
      <div className={styles.filters__row}>
        <input
          className={styles.filters__search}
          placeholder="Поиск события"
          aria-label="Поиск события"
          value={draft.text}
          onChange={(event) => patch({ text: event.target.value })}
        />
        <select
          className={styles.filters__type}
          aria-label="Тип события"
          value={draft.type}
          onChange={(event) => patch({ type: event.target.value })}
        >
          <option value="">Тип события</option>
          {AUDIT_EVENT_TYPES.map((value) => (
            <option key={value} value={value}>
              {AUDIT_EVENT_TYPE_TITLES[value]}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.filters__submit}>
          искать
        </button>
      </div>
      <div className={styles.filters__row}>
        <span className={styles.filters__caption}>Искать:</span>
        <label className={styles.filters__check}>
          <input
            type="checkbox"
            checked={draft.byOperator}
            onChange={(event) => patch({ byOperator: event.target.checked })}
          />{" "}
          по оператору
        </label>
        <label className={styles.filters__check}>
          <input
            type="checkbox"
            checked={draft.byCard}
            onChange={(event) => patch({ byCard: event.target.checked })}
          />{" "}
          по карточке
        </label>
      </div>
      <div className={styles.filters__row}>
        <span className={styles.filters__caption}>Искать по датам:</span>
        <input
          className={styles.filters__date}
          aria-label="Дата с"
          placeholder="дд.мм.гггг"
          size={DATE_SIZE}
          value={draft.from}
          onChange={(event) => patch({ from: event.target.value })}
        />
        <input className={styles.filters__date} aria-label="Время с" defaultValue="00:00" size={TIME_SIZE} />
        <span aria-hidden="true">–</span>
        <input
          className={styles.filters__date}
          aria-label="Дата по"
          placeholder="дд.мм.гггг"
          size={DATE_SIZE}
          value={draft.to}
          onChange={(event) => patch({ to: event.target.value })}
        />
        <input className={styles.filters__date} aria-label="Время по" defaultValue="23:59" size={TIME_SIZE} />
      </div>
    </form>
  );
}
