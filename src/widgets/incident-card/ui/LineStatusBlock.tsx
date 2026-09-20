"use client";

import { TELEPHONY_STATUS_TITLES } from "@/entities/service";

import { useLineStatus } from "../model/useLineStatus";

import styles from "./PhoneBar.module.css";

type LineStatusBlockProps = {
  hasRecordings: boolean;
  onRecordingsClick: () => void;
  onSmsClick: () => void;
  /** Живой режим обучающегося: статус из общего стора телефонии. */
  isLive?: boolean;
  readOnly?: boolean;
};

/** Блок состояния линии: статус телефонии (4 состояния, клик переключает), «записи звонков», «список SMS». */
export function LineStatusBlock({
  hasRecordings,
  onRecordingsClick,
  onSmsClick,
  isLive = false,
  readOnly = false,
}: LineStatusBlockProps) {
  const { status, toggle } = useLineStatus(isLive && !readOnly);
  const title = TELEPHONY_STATUS_TITLES[status];
  return (
    <div className={styles.bar__line}>
      <button
        type="button"
        className={styles.bar__status}
        onClick={toggle}
        disabled={readOnly}
        data-line-status={status}
        title="Статус телефонии — клик переключает"
        aria-label={`Статус телефонии: ${title}`}
      >
        {title}
      </button>
      <div className={styles.bar__buttons}>
        <button
          type="button"
          className={[
            styles.bar__small,
            styles["bar__small--records"],
            hasRecordings ? "" : styles["bar__small--empty"],
          ].join(" ")}
          onClick={onRecordingsClick}
        >
          записи звонков
        </button>
        <button type="button" className={styles.bar__small} onClick={onSmsClick}>
          список SMS
        </button>
      </div>
    </div>
  );
}
