import { describeSource, listCriticalEvents } from "@/entities/system";
import type { SystemLogEntry, SystemService } from "@/entities/system";
import { formatDateTime } from "@/shared/lib";
import { Panel } from "@/shared/ui";

import styles from "./AlertFeed.module.css";

type AlertFeedProps = {
  logs: SystemLogEntry[];
  services: SystemService[];
};

/** Лента критических событий — записи ERROR системных журналов (ТЗ §9 «оповещения об ошибках»). */
export function AlertFeed({ logs, services }: AlertFeedProps) {
  const alerts = listCriticalEvents(logs);
  return (
    <Panel title="Оповещения об ошибках" headerTone="dark">
      <ul className={styles.feed} aria-label="Лента критических событий">
        {alerts.map((alert) => (
          <li key={alert.id} className={styles.feed__item} data-level="critical">
            <span className={styles.feed__time}>{formatDateTime(alert.at)}</span>
            <span className={styles.feed__level}>Критично</span>
            <span>
              {describeSource(services, alert.source)}: {alert.message}
            </span>
          </li>
        ))}
        {alerts.length === 0 ? (
          <li className={styles.feed__item}>
            <span>Критических событий за период хранения журналов нет</span>
          </li>
        ) : null}
      </ul>
      <p className={styles.feed__note}>
        Автовосстановление и отказоустойчивость узлов (ТЗ §9) — декларация для бэкенда: в демо-контуре
        работает один узел, резервный «не подключён», перезапуск выполняется вручную.
      </p>
    </Panel>
  );
}
