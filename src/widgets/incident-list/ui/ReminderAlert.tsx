import Link from "next/link";
import { useState } from "react";

import { formatDateTime } from "@/shared/lib";
import { Button, Input, Modal } from "@/shared/ui";

import { fromMoscowInputValue, toMoscowInputValue } from "../lib/time";
import type { JournalReminder } from "../model/useReminders";
import styles from "./Reminder.module.css";

type ReminderAlertProps = {
  reminder: JournalReminder;
  nowMs: number;
  /** Закрыть без действий — окно повторится через 20 сек. */
  onDismiss: () => void;
  onGoToCard: () => void;
  onRemove: () => void;
  onReassign: (remindAt: string) => void;
};

const MODAL_WIDTH = 480;
const REASSIGN_DELAY_MS = 5 * 60_000;

/** Окно сработавшего напоминания: перейти в карточку · удалить · переназначить (меняется только время). */
export function ReminderAlert({
  reminder,
  nowMs,
  onDismiss,
  onGoToCard,
  onRemove,
  onReassign,
}: ReminderAlertProps) {
  const [isReassigning, setIsReassigning] = useState(false);
  const [remindAt, setRemindAt] = useState(() => toMoscowInputValue(nowMs + REASSIGN_DELAY_MS));

  function handleReassign() {
    const remindAtIso = fromMoscowInputValue(remindAt);
    if (remindAtIso) onReassign(remindAtIso);
  }

  return (
    <Modal title={`Напоминание: происшествие ${reminder.cardNumber}`} onClose={onDismiss} width={MODAL_WIDTH}>
      <div className={styles.reminder} role="alertdialog" aria-label="Сработало напоминание">
        <p className={styles.reminder__text}>{reminder.text}</p>
        <p className={styles.reminder__meta}>Время срабатывания: {formatDateTime(reminder.remindAt)}</p>
        {isReassigning ? (
          <Input
            label="Новое время срабатывания"
            type="datetime-local"
            value={remindAt}
            onChange={(event) => setRemindAt(event.target.value)}
          />
        ) : null}
        <div className={styles.reminder__actions}>
          <Link href={reminder.href} className={styles.reminder__link} onClick={onGoToCard}>
            Перейти в карточку
          </Link>
          <Button variant="danger" size="sm" onClick={onRemove}>
            Удалить
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={isReassigning ? handleReassign : () => setIsReassigning(true)}
          >
            {isReassigning ? "Сохранить время" : "Переназначить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
