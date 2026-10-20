/*
 * История чата разбора попытки в sessionStorage (спека 010, T014): переживает перезагрузку вкладки, на сервер не уходит.
 * Ключ — arm112_chat_attempt_{attemptId}; хранится не больше CHAT_HISTORY_LIMIT последних реплик. Любой доступ к
 * хранилищу обёрнут в try/catch: приватное окно, заблокированные данные сайта и переполнение квоты дают пустую историю,
 * а не исключение. Тип реплики — параметр: модуль не зависит от контрактов shared/api.
 */
import { createWebStorage } from "../storage";
import type { KeyValueStorage } from "../storage";

export const CHAT_HISTORY_LIMIT = 50;
const KEY_PREFIX = "arm112_chat_attempt_";

/** Минимум, который нужен истории: id реплики (отбраковка повреждённых записей). */
export interface ChatHistoryEntry {
  id: string;
}

export interface ChatHistoryStore<TMessage extends ChatHistoryEntry> {
  /** Реплики попытки (не больше CHAT_HISTORY_LIMIT); нет записи или она повреждена — []. */
  load(attemptId: string): TMessage[];
  /** Сохраняет последние CHAT_HISTORY_LIMIT реплик; старые отбрасываются. */
  save(attemptId: string, messages: readonly TMessage[]): void;
  /** Удаляет историю одной попытки. */
  clear(attemptId: string): void;
}

export function chatHistoryKey(attemptId: string): string {
  return `${KEY_PREFIX}${attemptId}`;
}

function isEntry(candidate: unknown): candidate is ChatHistoryEntry {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as { id?: unknown }).id === "string"
  );
}

function parseEntries<TMessage extends ChatHistoryEntry>(raw: string | null): TMessage[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(-CHAT_HISTORY_LIMIT) as TMessage[];
  } catch {
    return [];
  }
}

/** Доступ к хранилищу, который не должен бросать наружу: при сбое — значение по умолчанию. */
function safely<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

function defaultSessionStorage(): KeyValueStorage {
  return createWebStorage(() => (typeof window === "undefined" ? undefined : window.sessionStorage));
}

/** Хранилище истории: по умолчанию — sessionStorage вкладки; в тестах подменяется памятью или сбойным хранилищем. */
export function createChatHistoryStore<TMessage extends ChatHistoryEntry>(
  storage: KeyValueStorage = defaultSessionStorage(),
): ChatHistoryStore<TMessage> {
  return {
    load: (attemptId) => parseEntries<TMessage>(safely(() => storage.get(chatHistoryKey(attemptId)), null)),
    save: (attemptId, messages) => {
      const kept = messages.slice(-CHAT_HISTORY_LIMIT);
      safely(() => storage.set(chatHistoryKey(attemptId), JSON.stringify(kept)), undefined);
    },
    clear: (attemptId) => {
      safely(() => storage.remove(chatHistoryKey(attemptId)), undefined);
    },
  };
}
