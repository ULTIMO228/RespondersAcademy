"use client";

/*
 * Чат-ассистент разбора попытки (спека 010): кнопка в шапке экрана результатов + боковая шторка.
 * Только платформа, экран /student/results/[attemptId]; в симулятор и кабинеты преподавателя/админа не подключается.
 * Шторка рисуется порталом в body, чтобы не зависеть от вёрстки шапки.
 */
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import type { ChatMessage, LobbyMode } from "@/shared/api";
import type { ChatHistoryStore } from "@/shared/lib";
import { PlatformButton } from "@/shared/ui/platform";

import { buildChips, buildGreeting } from "../model/chips";
import type { ChatReviewContext } from "../model/chips";
import { useChat } from "../model/useChat";
import { ChatDrawer } from "./ChatDrawer";
import styles from "./AttemptChat.module.css";
import { ChatIcon } from "./ChatIcon";

export type AttemptChatProps = {
  attemptId: string;
  mode: LobbyMode;
  /** Загруженный разбор: из него строятся приветствие и чипы. */
  review: ChatReviewContext;
  /** Заголовок шторки: «Разбор попытки: …». */
  title: string;
  /** Подмена зависимостей в тестах. */
  send?: Parameters<typeof useChat>[0]["send"];
  store?: ChatHistoryStore<ChatMessage>;
};

function AttemptChatInner({ attemptId, mode, review, title, send, store }: AttemptChatProps) {
  const chat = useChat({ attemptId, mode, send, store });
  const triggerRef = useRef<HTMLSpanElement>(null);
  const greeting = useMemo(() => buildGreeting(review), [review]);
  const chips = useMemo(() => buildChips(review), [review]);
  const isOpen = chat.status !== "closed";

  // После закрытия фокус возвращается на кнопку (Safari не фокусирует кнопку кликом, поэтому шторке одной мало).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !isOpen) triggerRef.current?.querySelector("button")?.focus();
    wasOpen.current = isOpen;
  }, [isOpen]);

  return (
    <>
      <span ref={triggerRef} className={styles.trigger}>
        <PlatformButton variant="primary" onClick={chat.open} aria-haspopup="dialog">
          <ChatIcon name="chat" size={18} />
          Обсудить результат с ИИ
        </PlatformButton>
      </span>
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <ChatDrawer
              title={title}
              greeting={greeting}
              messages={chat.messages}
              chips={chips}
              status={chat.status}
              notice={chat.notice}
              onAsk={chat.ask}
              onRetry={chat.retry}
              onClear={chat.clear}
              onClose={chat.close}
            />,
            document.body,
          )
        : null}
    </>
  );
}

/** Смена попытки пересоздаёт чат (key): запрос отменяется, лента читается из хранилища новой попытки. */
export function AttemptChat(props: AttemptChatProps) {
  return <AttemptChatInner key={props.attemptId} {...props} />;
}
