"use client";

import { useState } from "react";
import type { FormEvent } from "react";

import { formatDateTime } from "@/shared/lib";
import { Button, Modal } from "@/shared/ui";

import { useSmsThread } from "../model/useSmsThread";

import styles from "./SmsPanel.module.css";

type SmsPanelProps = {
  cardId: string;
  aon: string;
  /** Входящие СМС с АОН карточки (прототип; в живом режиме — из мок-слоя). */
  incoming: string[];
  receivedAt: string;
  isLive?: boolean;
  readOnly?: boolean;
  onClose: () => void;
};

const MODAL_WIDTH = 560;

/** «Список СМС» / «История сообщений» по АОН карточки + форма «Отправить СМС» (spec п. 14). */
export function SmsPanel(props: SmsPanelProps) {
  const { cardId, aon, incoming, receivedAt, isLive = false, readOnly = false, onClose } = props;
  const { messages, isLoading, error, send } = useSmsThread({ cardId, isLive, incoming, receivedAt });
  const [draft, setDraft] = useState("");
  const [isSending, setSending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      await send(text);
      setDraft("");
    } catch {
      /* ошибка показана в панели, черновик сохраняется */
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Список СМС" onClose={onClose} width={MODAL_WIDTH}>
      <p className={styles.sms__aon}>АОН: {aon || "не определён"}</p>
      {isLoading ? <p className={styles.sms__empty}>Загрузка…</p> : null}
      {!isLoading && messages.length === 0 ? <p className={styles.sms__empty}>Сообщений нет</p> : null}
      {messages.length > 0 ? (
        <ul className={styles.sms__list} aria-label="История сообщений">
          {messages.map((message) => (
            <li
              key={message.id}
              className={[styles.sms__message, styles[`sms__message--${message.direction}`]].join(" ")}
            >
              <span className={styles.sms__meta}>
                {message.direction === "in" ? "Входящее" : "Исходящее"} · {formatDateTime(message.at)}
              </span>
              {message.text}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className={styles.sms__empty} role="alert">
          {error}
        </p>
      ) : null}
      {readOnly || !aon ? null : (
        <form className={styles.sms__form} onSubmit={handleSubmit} aria-label="Отправить СМС">
          <textarea
            className={styles.sms__field}
            aria-label="Текст СМС"
            placeholder="введите"
            value={draft}
            rows={2}
            onChange={(event) => setDraft(event.target.value)}
          />
          <Button type="submit" variant="blue" disabled={!draft.trim() || isSending}>
            Отправить СМС
          </Button>
        </form>
      )}
    </Modal>
  );
}
