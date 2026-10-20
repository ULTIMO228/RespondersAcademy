"use client";

import { useEffect, useRef } from "react";

import type { ChatMessage } from "@/shared/api";
import { AiSourceBadge } from "@/shared/ui/AiSourceBadge";
import { PlatformButton } from "@/shared/ui/platform";

import styles from "./MessageFeed.module.css";

type MessageFeedProps = {
  greeting: string;
  messages: ChatMessage[];
  waiting: boolean;
  /** Сообщение об ошибке последней отправки (с «Повторить»). */
  notice: string | null;
  onRetry: () => void;
};

/** Лента: приветствие (без бейджа), реплики, индикатор ожидания и ошибка. Простой текст, абзацы сохраняются. */
export function MessageFeed({ greeting, messages, waiting, notice, onRetry }: MessageFeedProps) {
  const endRef = useRef<HTMLDivElement>(null);

  // Плавная автопрокрутка к новому сообщению (в окружениях без scrollIntoView — молча пропускаем).
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages.length, waiting, notice]);

  return (
    <div className={styles.feed} role="log" aria-live="polite" aria-label="Переписка с ассистентом">
      <div className={`${styles.bubble} ${styles["bubble--assistant"]}`}>
        <p className={styles.text}>{greeting}</p>
      </div>
      {messages.map((message) => (
        <div
          key={message.id}
          className={`${styles.bubble} ${styles[`bubble--${message.role}`]}`}
          data-failed={message.status === "failed" || undefined}
        >
          <p className={styles.text}>{message.content}</p>
          {message.role === "assistant" ? (
            <div className={styles.badge}>
              <AiSourceBadge source={message.source} model={message.modelName} />
            </div>
          ) : null}
        </div>
      ))}
      {waiting ? (
        <div className={`${styles.bubble} ${styles["bubble--assistant"]}`} role="status">
          <p className={styles.text}>Ассистент думает…</p>
        </div>
      ) : null}
      {notice ? (
        <div className={styles.notice} role="alert">
          <p className={styles.text}>{notice}</p>
          <PlatformButton variant="secondary" onClick={onRetry}>
            Повторить
          </PlatformButton>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}
