"use client";

import { ISOLATED_LOOP_NOTE } from "@/entities/system";
import type { SystemIntegrity } from "@/entities/system";
import { formatDateTime } from "@/shared/lib";
import { Toggle } from "@/shared/ui";

import styles from "./SystemIndicators.module.css";

type SystemIndicatorsProps = {
  integrity: SystemIntegrity;
  autoRecovery: boolean;
  onToggleAutoRecovery: (enabled: boolean) => void;
};

/**
 * Индикаторы «контур изолирован» и «Целостность системы» (T4.2-10) + тумблер автовосстановления
 * (T4.2-11): значение хранится в настройках, поэтому переживает перезагрузку страницы.
 */
export function SystemIndicators({ integrity, autoRecovery, onToggleAutoRecovery }: SystemIndicatorsProps) {
  return (
    <div className={styles.indicators}>
      <p className={styles.indicator}>
        <span className={styles.indicator__dot} aria-hidden="true" />
        <span>
          <strong>Контур изолирован</strong>
          <span className={styles.indicator__hint}>{ISOLATED_LOOP_NOTE}</span>
        </span>
      </p>
      {integrity.ok ? (
        <p className={styles.indicator}>
          <span className={styles.indicator__dot} aria-hidden="true" />
          <span>
            <strong>Целостность системы: OK</strong>
            <span className={styles.indicator__hint}>самопроверка {formatDateTime(integrity.checkedAt)}</span>
          </span>
        </p>
      ) : (
        <p className={[styles.indicator, styles["indicator--broken"]].join(" ")} role="alert">
          <span>
            <strong>Целостность системы: нарушена</strong>
            <span className={styles.indicator__hint}>
              {integrity.details} (самопроверка {formatDateTime(integrity.checkedAt)})
            </span>
          </span>
        </p>
      )}
      <div className={styles.indicator}>
        <Toggle
          label="Автовосстановление сервисов после сбоев"
          checked={autoRecovery}
          onChange={onToggleAutoRecovery}
        />
      </div>
    </div>
  );
}
