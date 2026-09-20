"use client";

import { formatUptime, SERVICE_ACTION_TITLES, SERVICE_STATE_TITLES } from "@/entities/system";
import type { SystemService, SystemServiceAction } from "@/entities/system";
import { Button } from "@/shared/ui";

import { SESSION_LOCK_NOTE } from "../lib/session-guard";

import styles from "./ServiceTile.module.css";

type ServiceTileProps = {
  service: SystemService;
  /** Мок-действие выполняется: кнопки заблокированы, показывается индикация. */
  isPending: boolean;
  /** Остановка и перезапуск запрещены во время активного занятия (T4.2-24). */
  isLocked: boolean;
  onAction: (action: SystemServiceAction) => void;
};

/** Плитка сервиса: цветная полоса состояния (продублировано текстом), аптайм и кнопки управления. */
export function ServiceTile({ service, isPending, isLocked, onAction }: ServiceTileProps) {
  const isStopped = service.state === "stopped";
  return (
    <article className={[styles.tile, styles[`tile--${service.state}`]].join(" ")} data-state={service.state}>
      <header className={styles.tile__header}>
        <h3 className={styles.tile__name}>{service.name}</h3>
        {service.critical ? <span className={styles.tile__critical}>критичный</span> : null}
      </header>
      <p className={styles.tile__description}>{service.description}</p>
      <dl className={styles.tile__facts}>
        <dt>Состояние</dt>
        <dd className={styles.tile__state}>
          <span
            className={[styles.tile__dot, styles[`tile__dot--${service.state}`]].join(" ")}
            aria-hidden="true"
          />
          {SERVICE_STATE_TITLES[service.state]}
        </dd>
        <dt>Аптайм</dt>
        <dd>{formatUptime(service.uptimeSec)}</dd>
      </dl>
      <div className={styles.tile__actions}>
        <Button
          size="sm"
          variant="ghost"
          disabled={!isStopped || isPending}
          onClick={() => onAction("start")}
        >
          {SERVICE_ACTION_TITLES.start}
        </Button>
        <Button
          size="sm"
          variant="danger"
          disabled={isStopped || isLocked || isPending}
          title={isLocked ? SESSION_LOCK_NOTE : undefined}
          onClick={() => onAction("stop")}
        >
          {SERVICE_ACTION_TITLES.stop}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isStopped || isLocked || isPending}
          title={isLocked ? SESSION_LOCK_NOTE : undefined}
          onClick={() => onAction("restart")}
        >
          {SERVICE_ACTION_TITLES.restart}
        </Button>
      </div>
      {isPending ? (
        <p className={styles.tile__lock} role="status">
          Выполняется действие…
        </p>
      ) : null}
      {isLocked ? (
        <p className={styles.tile__lock}>Остановка и перезапуск: {SESSION_LOCK_NOTE.toLowerCase()}</p>
      ) : null}
    </article>
  );
}
