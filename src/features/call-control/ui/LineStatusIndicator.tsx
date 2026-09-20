"use client";

import { TELEPHONY_STATUS_TITLES } from "@/entities/service";

import { LINE_STATUS_HINTS } from "../config/callControl";
import type { LineStatus } from "../model/types";
import { HandsetIcon } from "./HandsetIcon";

import styles from "./LineStatusIndicator.module.css";

type LineStatusIndicatorProps = {
  status: LineStatus;
  onToggle: () => void;
};

/** Блок состояния линии оператора в шапке софтфона (дублирует блок линии карточки ПОВ-112). */
export function LineStatusIndicator({ status, onToggle }: LineStatusIndicatorProps) {
  const title = TELEPHONY_STATUS_TITLES[status];
  return (
    <button
      type="button"
      className={[styles["line-status"], styles[`line-status--${status}`]].join(" ")}
      onClick={onToggle}
      data-status={status}
      title={`Статус линии: ${title} — щёлкните, чтобы сменить (демо)`}
      aria-label={`Статус линии: ${title}. Сменить статус`}
    >
      <HandsetIcon className={styles["line-status__icon"]} isHungUp={status !== "available"} size={24} />
      <span className={styles["line-status__text"]}>
        <span className={styles["line-status__caption"]}>Статус линии</span>
        <span className={styles["line-status__value"]}>
          <span className={styles["line-status__dot"]} aria-hidden="true" />
          {title}
        </span>
        <span className={styles["line-status__hint"]}>{LINE_STATUS_HINTS[status]}</span>
      </span>
    </button>
  );
}
