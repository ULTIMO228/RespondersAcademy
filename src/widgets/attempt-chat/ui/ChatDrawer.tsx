"use client";

/*
 * Боковая шторка чата (спека 010, §2.2, §5): справа 460px, подложка, role="dialog" aria-modal, фокус-ловушка,
 * закрытие по ✕ / Escape / подложке, фокус в поле при открытии и возврат на кнопку-инициатор после закрытия.
 * Компонент монтируется только в открытом состоянии; логика чата живёт в useChat.
 */
import { useEffect, useId, useRef } from "react";
import type { KeyboardEvent } from "react";

import type { ChatMessage } from "@/shared/api";

import type { ChatStatus } from "../model/useChat";
import styles from "./ChatDrawer.module.css";
import { ChatIcon } from "./ChatIcon";
import { ChatInput } from "./ChatInput";
import { MessageFeed } from "./MessageFeed";
import { QuickChips } from "./QuickChips";

const FOCUSABLE = 'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

export type ChatDrawerProps = {
  title: string;
  greeting: string;
  messages: ChatMessage[];
  chips: string[];
  status: ChatStatus;
  notice: string | null;
  onAsk: (text: string) => void;
  onRetry: () => void;
  onClear: () => void;
  onClose: () => void;
};

export function ChatDrawer({
  title,
  greeting,
  messages,
  chips,
  status,
  notice,
  onAsk,
  onRetry,
  onClear,
  onClose,
}: ChatDrawerProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const waiting = status === "waiting";
  const hasUserMessage = messages.some((message) => message.role === "user");

  // Фокус в поле при открытии; при закрытии (размонтировании) — обратно на кнопку, открывшую шторку.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    return () => opener?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !panelRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !panelRef.current?.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className={styles.root} onKeyDown={onKeyDown}>
      <div className={styles.backdrop} data-testid="chat-backdrop" onClick={onClose} />
      <div ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className={styles.header}>
          <div className={styles.heading}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <span className={styles.subtitle}>ИИ-ассистент разбора</span>
          </div>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Очистить переписку"
            title="Очистить переписку"
            onClick={onClear}
          >
            <ChatIcon name="trash" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Закрыть"
            title="Закрыть"
            onClick={onClose}
          >
            <ChatIcon name="close" />
          </button>
        </header>
        <MessageFeed
          greeting={greeting}
          messages={messages}
          waiting={waiting}
          notice={notice}
          onRetry={onRetry}
        />
        {hasUserMessage ? null : <QuickChips chips={chips} disabled={waiting} onPick={onAsk} />}
        <ChatInput onSend={onAsk} waiting={waiting} />
        <p className={styles.disclaimer}>Оценку выставляет преподаватель, ответы ИИ справочные</p>
      </div>
    </div>
  );
}
