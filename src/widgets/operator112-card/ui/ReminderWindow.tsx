"use client";

import { useId, useState } from "react";

import styles from "./ReminderWindow.module.css";

type ReminderWindowProps = {
  cardNumber: number | string;
  /** Уже отформатированные «19:01 25.09.2018,». */
  dateTime: string;
  address: string;
  /** «что сделать». */
  note: string;
  onGoToCard: () => void;
  /** «напомнить позже» — через указанное число минут. */
  onSnooze: (minutes: number) => void;
  onDelete: () => void;
  /** «×» — просто скрыть окно. */
  onClose?: () => void;
};

const DEFAULT_SNOOZE_MIN = 5;

/** Окно «Напоминание для карточки N» (ИНСТРУКЦИЯ_image100; спека 009, FR-031). Поверх вида, не размонтирует его. */
export function ReminderWindow({
  cardNumber,
  dateTime,
  address,
  note,
  onGoToCard,
  onSnooze,
  onDelete,
  onClose,
}: ReminderWindowProps) {
  const titleId = useId();
  const minutesId = useId();
  const [minutes, setMinutes] = useState("");
  const parsed = Number.parseInt(minutes, 10);
  const snooze = () => onSnooze(Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SNOOZE_MIN);

  return (
    <div className={styles.overlay}>
      <div className={styles.window} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId} className={styles.window__title}>
          Напоминание для карточки: <span className={styles.window__muted}>{cardNumber}</span>
        </h2>
        {onClose ? (
          <button type="button" className={styles.window__close} aria-label="Закрыть" onClick={onClose}>
            ×
          </button>
        ) : null}
        <p className={styles.window__line}>{dateTime}</p>
        <p className={styles.window__line}>{address}</p>
        <p className={styles.window__line}>
          <span className={styles.window__muted}>что сделать:</span> {note}
        </p>
        <div className={styles.window__actions}>
          <button type="button" className={styles.window__go} onClick={onGoToCard}>
            перейти в карточку
          </button>
          <div className={styles.window__minutes}>
            <label htmlFor={minutesId}>Минуты</label>
            <input
              id={minutesId}
              className={styles.window__input}
              inputMode="numeric"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value.replace(/\D/g, ""))}
            />
          </div>
          <button type="button" className={styles.window__btn} onClick={snooze}>
            напомнить позже
          </button>
          <button type="button" className={styles.window__btn} onClick={onDelete}>
            удалить напоминание
          </button>
        </div>
      </div>
    </div>
  );
}
