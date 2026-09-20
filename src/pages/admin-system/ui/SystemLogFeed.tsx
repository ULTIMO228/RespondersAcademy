"use client";

import { useState } from "react";

import { LOG_LEVEL_TITLES, LOG_LEVELS, describeSource } from "@/entities/system";
import type { SystemLogEntry, SystemService } from "@/entities/system";
import { formatDateTime } from "@/shared/lib";
import { Chip } from "@/shared/ui";

import type { SystemApi } from "../api/systemApi";
import type { LogLevelFilter } from "../model/useSystemLogs";
import { useSystemLogs } from "../model/useSystemLogs";

import styles from "./SystemLogFeed.module.css";

type SystemLogFeedProps = {
  initialLogs: SystemLogEntry[];
  /** Интервал автообновления ленты — из настроек производительности (T4.2-23). */
  refreshIntervalSec: number;
  services: SystemService[];
  api?: SystemApi;
};

/** «Системные журналы»: фильтр уровня выполняет мок-API; уровень продублирован текстом. */
export function SystemLogFeed({ initialLogs, refreshIntervalSec, services, api }: SystemLogFeedProps) {
  const [level, setLevel] = useState<LogLevelFilter>("ALL");
  const logs = useSystemLogs(level, refreshIntervalSec, initialLogs, api);
  return (
    <div className={styles.logs}>
      <div className={styles.logs__filters} role="group" aria-label="Уровень логов">
        <Chip selected={level === "ALL"} onClick={() => setLevel("ALL")}>
          Все
        </Chip>
        {LOG_LEVELS.map((item) => (
          <Chip key={item} selected={level === item} onClick={() => setLevel(item)}>
            {item}
          </Chip>
        ))}
      </div>
      {logs.length === 0 ? <p className={styles.logs__empty}>Записей выбранного уровня нет</p> : null}
      <ul className={styles.logs__list} aria-label="Лента логов сервисов">
        {logs.map((entry) => (
          <li key={entry.id} className={styles.logs__row} data-level={entry.level}>
            <span className={styles.logs__time}>{formatDateTime(entry.at)}</span>
            <span className={styles.logs__level} title={LOG_LEVEL_TITLES[entry.level]}>
              {entry.level}
            </span>
            <span className={styles.logs__source}>{describeSource(services, entry.source)}</span>
            <span>{entry.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
