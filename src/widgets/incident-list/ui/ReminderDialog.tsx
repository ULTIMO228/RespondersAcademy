import { useState } from "react";
import type { FormEvent } from "react";

import type { IncidentListItem } from "@/entities/incident";
import { Button, Input, Modal } from "@/shared/ui";

import { fromMoscowInputValue, toMoscowInputValue } from "../lib/time";
import type { ReminderDraft } from "../model/useReminders";
import styles from "./Reminder.module.css";

type ReminderDialogProps = {
  item: IncidentListItem;
  nowMs: number;
  onSubmit: (draft: ReminderDraft) => Promise<string | null>;
  onClose: () => void;
};

/** Время срабатывания по умолчанию — через 5 минут. */
const DEFAULT_DELAY_MS = 5 * 60_000;
const MODAL_WIDTH = 480;

/** Будильник «напоминание» (источник п. 3.13): текст + время срабатывания (московское время). */
export function ReminderDialog({ item, nowMs, onSubmit, onClose }: ReminderDialogProps) {
  const [text, setText] = useState("");
  const [remindAt, setRemindAt] = useState(() => toMoscowInputValue(nowMs + DEFAULT_DELAY_MS));
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const remindAtIso = fromMoscowInputValue(remindAt);
    if (!text.trim() || !remindAtIso) return setError("Укажите текст и время срабатывания напоминания");
    const draft = { cardId: item.id, cardNumber: item.number, href: item.href, text: text.trim() };
    const failure = await onSubmit({ ...draft, remindAt: remindAtIso });
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <Modal title={`Напоминание: происшествие ${item.number}`} onClose={onClose} width={MODAL_WIDTH}>
      <form className={styles.reminder} aria-label="Новое напоминание" onSubmit={handleSubmit}>
        <Input label="Текст напоминания" value={text} onChange={(event) => setText(event.target.value)} />
        <Input
          label="Время срабатывания"
          type="datetime-local"
          value={remindAt}
          onChange={(event) => setRemindAt(event.target.value)}
        />
        {error ? (
          <p className={styles.reminder__error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.reminder__actions}>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="blue" size="sm">
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}
