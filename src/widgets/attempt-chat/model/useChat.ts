"use client";

/*
 * Состояние чата разбора попытки (спека 020, T015). Состояния: closed | open | waiting | error.
 * Ответ строит сервер; клиент хранит ленту в sessionStorage по attemptId, отправляет последние 6 реплик истории,
 * отменяет запрос при закрытии шторки и размонтировании (смена попытки = новый экземпляр по key).
 * Приветствие в ленту не попадает: оно строится в интерфейсе из модели разбора.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError, postAttemptChat, ServerRequiredError } from "@/shared/api";
import type { ChatMessage, ChatRequest, ChatResponse, LobbyMode } from "@/shared/api";
import { createChatHistoryStore } from "@/shared/lib";
import type { ChatHistoryStore } from "@/shared/lib";

export type ChatStatus = "closed" | "open" | "waiting" | "error";

export const HISTORY_TURNS = 6;
const HTTP_TOO_MANY = 429;

export const CHAT_NOTICES = {
  tooMany: "Слишком много вопросов за короткое время. Подождите немного и повторите.",
  serverRequired: "Чат доступен только при подключении к серверу тренажёра.",
  generic: "Не удалось получить ответ. Повторите попытку.",
  interrupted: "Ответ не получен: шторка была закрыта. Повторите вопрос.",
} as const;

type UseChatOptions = {
  attemptId: string;
  mode: LobbyMode;
  /** Подменяемые зависимости (в тестах): отправка и хранилище истории. */
  send?: (request: ChatRequest, signal?: AbortSignal) => Promise<ChatResponse>;
  store?: ChatHistoryStore<ChatMessage>;
};

export type UseChat = {
  status: ChatStatus;
  messages: ChatMessage[];
  /** Понятное сообщение об ошибке последней отправки; null, если всё хорошо. */
  notice: string | null;
  open: () => void;
  close: () => void;
  ask: (text: string) => void;
  retry: () => void;
  clear: () => void;
};

let counter = 0;
function nextId(): string {
  counter += 1;
  return `msg-${Date.now().toString(36)}-${counter}`;
}

function toNotice(error: unknown): string {
  if (error instanceof ServerRequiredError) return CHAT_NOTICES.serverRequired;
  if (error instanceof ApiError && error.status === HTTP_TOO_MANY) return CHAT_NOTICES.tooMany;
  return CHAT_NOTICES.generic;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Последние HISTORY_TURNS доставленных реплик перед позицией `before` (неудавшиеся не считаются историей). */
function historyBefore(messages: ChatMessage[], before: number): ChatRequest["history"] {
  return messages
    .slice(0, before)
    .filter((message) => message.status === "sent")
    .slice(-HISTORY_TURNS)
    .map(({ role, content }) => ({ role, content }));
}

export function useChat({
  attemptId,
  mode,
  send = postAttemptChat,
  store: injectedStore,
}: UseChatOptions): UseChat {
  const [store] = useState(() => injectedStore ?? createChatHistoryStore<ChatMessage>());
  const [messages, setMessages] = useState<ChatMessage[]>(() => store.load(attemptId));
  const [status, setStatus] = useState<ChatStatus>("closed");
  const [notice, setNotice] = useState<string | null>(null);
  const messagesRef = useRef(messages);
  const waitingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);

  const commit = useCallback(
    (next: ChatMessage[]) => {
      messagesRef.current = next;
      setMessages(next);
      store.save(attemptId, next);
    },
    [attemptId, store],
  );

  const markFailed = useCallback(
    (id: string) => {
      commit(
        messagesRef.current.map((message) =>
          message.id === id ? { ...message, status: "failed" } : message,
        ),
      );
    },
    [commit],
  );

  const dispatch = useCallback(
    async (target: ChatMessage, history: ChatRequest["history"]) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      waitingRef.current = true;
      setNotice(null);
      setStatus("waiting");
      try {
        const answer = await send({ attemptId, mode, message: target.content, history }, controller.signal);
        if (controller.signal.aborted) return;
        commit([
          ...messagesRef.current,
          {
            id: nextId(),
            role: "assistant",
            content: answer.reply,
            source: answer.source,
            modelName: answer.modelName,
            status: "sent",
            timestamp: new Date().toISOString(),
          },
        ]);
        setStatus("open");
      } catch (error) {
        if (controller.signal.aborted || isAbort(error)) return;
        markFailed(target.id);
        setNotice(toNotice(error));
        setStatus("error");
      } finally {
        if (controllerRef.current === controller) {
          waitingRef.current = false;
          controllerRef.current = null;
        }
      }
    },
    [attemptId, commit, markFailed, mode, send],
  );

  const ask = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || waitingRef.current) return;
      const history = historyBefore(messagesRef.current, messagesRef.current.length);
      const message: ChatMessage = {
        id: nextId(),
        role: "user",
        content,
        status: "sent",
        timestamp: new Date().toISOString(),
      };
      commit([...messagesRef.current, message]);
      void dispatch(message, history);
    },
    [commit, dispatch],
  );

  const retry = useCallback(() => {
    if (waitingRef.current) return;
    const index = messagesRef.current.findLastIndex((m) => m.role === "user" && m.status === "failed");
    if (index < 0) return;
    const history = historyBefore(messagesRef.current, index);
    const message: ChatMessage = { ...messagesRef.current[index], status: "sent" };
    commit(messagesRef.current.map((m, i) => (i === index ? message : m)));
    void dispatch(message, history);
  }, [commit, dispatch]);

  const open = useCallback(() => {
    const hasFailed = messagesRef.current.some((m) => m.status === "failed");
    setStatus(waitingRef.current ? "waiting" : hasFailed ? "error" : "open");
  }, []);

  const close = useCallback(() => {
    if (waitingRef.current) {
      // Ответ в пути не нужен: отменяем запрос, а вопрос оставляем с «Повторить».
      const pending = messagesRef.current.findLast((m) => m.role === "user" && m.status === "sent");
      controllerRef.current?.abort();
      controllerRef.current = null;
      waitingRef.current = false;
      if (pending) markFailed(pending.id);
      setNotice(CHAT_NOTICES.interrupted);
    }
    setStatus("closed");
  }, [markFailed]);

  const clear = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    waitingRef.current = false;
    store.clear(attemptId);
    messagesRef.current = [];
    setMessages([]);
    setNotice(null);
    setStatus("open");
  }, [attemptId, store]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  return { status, messages, notice, open, close, ask, retry, clear };
}
