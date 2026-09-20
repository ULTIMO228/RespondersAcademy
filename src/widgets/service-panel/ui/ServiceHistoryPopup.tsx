"use client";

import { useEffect, useRef } from "react";

import { getStatusTitle } from "@/entities/service";
import type { ServiceStatusEvent } from "@/entities/service";
import type { StatusRef } from "@/shared/api";
import { formatDateTime } from "@/shared/lib";

import { useEscapeKey } from "../model/useEscapeKey";

import styles from "./ServiceHistoryPopup.module.css";

type ServiceHistoryPopupProps = {
  title: string;
  events: ServiceStatusEvent[];
  serviceStatuses: StatusRef[];
  onClose: () => void;
};

function Arrow() {
  return (
    <svg className={styles.history__arrow} width="7" height="10" viewBox="0 0 7 10" aria-hidden="true">
      <path d="M1 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

/** Синий попап истории службы (ДДС_image10–20, p25): «оп. 0 › 17.09.2026 11:23:21 Принята › комментарий». */
export function ServiceHistoryPopup({ title, events, serviceStatuses, onClose }: ServiceHistoryPopupProps) {
  const listRef = useRef<HTMLOListElement>(null);
  useEscapeKey(onClose);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [events.length]);

  return (
    <div className={styles.history} role="dialog" aria-label={`История: ${title}`}>
      <header className={styles.history__header}>
        <span>{title}</span>
        <button
          type="button"
          className={styles.history__close}
          onClick={onClose}
          aria-label="Закрыть историю (Esc)"
          title="Закрыть (Esc)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.4" />
          </svg>
        </button>
      </header>
      {events.length === 0 ? <p className={styles.history__empty}>Статусов службы пока нет</p> : null}
      <ol ref={listRef} className={styles.history__list}>
        {events.map((event, index) => (
          <li key={`${event.at}-${index}`} className={styles.history__row}>
            <span className={styles.history__actor} title={event.actor}>
              {event.actor}
            </span>
            <span className={styles.history__main}>
              <Arrow />
              {formatDateTime(event.at)} {getStatusTitle(event.status, serviceStatuses)}
            </span>
            {event.comment ? (
              <span className={styles.history__comment}>
                <Arrow />
                {event.comment}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
