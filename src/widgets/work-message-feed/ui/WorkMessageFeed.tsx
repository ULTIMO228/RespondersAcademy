"use client";

import type { WorkMessage } from "@/shared/api";
import { useWorkMessages } from "../model/useWorkMessages";
import type { FetchWorkMessages } from "../model/useWorkMessages";
import { formatWorkMessage } from "../model/messageText";
import type { RealtimeDeps } from "@/shared/lib";

import styles from "./WorkMessageFeed.module.css";

type WorkMessageFeedProps = {
  attemptId: string;
  enabled?: boolean;
  fetchMessages?: FetchWorkMessages;
  deps?: Partial<RealtimeDeps>;
};

/**
 * Сообщения служб о ходе работ (этап ДДС): «ЧЧ:ММ:СС · Расчёт выехал…». Пока сообщений нет (занятие их не включало или они ещё
 * не наступили), блок скрыт; при потере связи показанное остаётся, добавляется пометка.
 */
export function WorkMessageFeed({ attemptId, enabled = true, fetchMessages, deps }: WorkMessageFeedProps) {
  const { messages, isOnline } = useWorkMessages({ attemptId, enabled, fetchMessages, deps });
  return <WorkMessageList messages={messages} isOnline={isOnline} />;
}

/** Только отображение: страница, которой ещё нужно знать «есть ли сообщения», держит хук сама. */
export function WorkMessageList({ messages, isOnline }: { messages: WorkMessage[]; isOnline: boolean }) {
  if (messages.length === 0) return null;
  return (
    <section className={styles.feed} aria-label="Сообщения служб о ходе работ">
      <h3 className={styles.feed__title}>Сообщения служб</h3>
      <ol className={styles.feed__list} aria-live="polite">
        {messages.map((message) => (
          <li key={message.id} data-kind={message.kind}>
            {formatWorkMessage(message)}
          </li>
        ))}
      </ol>
      {isOnline ? null : (
        <p className={styles.feed__offline} role="status">
          Связь потеряна — показанные сообщения сохранены, новые подгрузятся после восстановления
        </p>
      )}
    </section>
  );
}
