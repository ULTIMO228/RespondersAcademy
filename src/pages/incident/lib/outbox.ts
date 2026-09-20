/*
 * Буфер несохранённых действий карточки (T2.3-20, ТЗ §7 «Сбой сети»): при потере связи статусы, текст и
 * отработки копятся локально (localStorage за интерфейсом KeyValueStorage) и досылаются по порядку после
 * восстановления. Перезагрузка страницы буфер не теряет.
 */
import type { AttemptProgressRequest, CardStatusRequest, CardWorkLineRequest } from "@/shared/api";
import type { KeyValueStorage } from "@/shared/lib";

export type OutboxItem =
  | { id: string; kind: "status"; cardId: string; attemptId: string; request: CardStatusRequest; at: string }
  | { id: string; kind: "progress"; attemptId: string; request: AttemptProgressRequest }
  | { id: string; kind: "workline"; cardId: string; request: CardWorkLineRequest };

const OUTBOX_KEY_PREFIX = "arm112:outbox";
const OUTBOX_VERSION = 1;
const OUTBOX_KINDS: readonly OutboxItem["kind"][] = ["status", "progress", "workline"];

export function outboxStorageKey(cardId: string, studentId: string): string {
  return `${OUTBOX_KEY_PREFIX}:${studentId}:${cardId}`;
}

function isOutboxItem(candidate: unknown): candidate is OutboxItem {
  if (typeof candidate !== "object" || candidate === null) return false;
  const item = candidate as { id?: unknown; kind?: unknown; request?: unknown };
  return (
    typeof item.id === "string" &&
    (OUTBOX_KINDS as readonly unknown[]).includes(item.kind) &&
    typeof item.request === "object" &&
    item.request !== null
  );
}

export function readOutbox(storage: KeyValueStorage, key: string): OutboxItem[] {
  try {
    const parsed = JSON.parse(storage.get(key) ?? "null") as { version?: number; items?: unknown };
    if (parsed?.version !== OUTBOX_VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(isOutboxItem);
  } catch {
    return [];
  }
}

export function writeOutbox(storage: KeyValueStorage, key: string, items: OutboxItem[]): void {
  if (items.length === 0) storage.remove(key);
  else storage.set(key, JSON.stringify({ version: OUTBOX_VERSION, items }));
}

/** Прогрессы текста схлопываются: из подряд идущих правок «Действия диспетчера» досылается последняя. */
export function enqueue(items: OutboxItem[], item: OutboxItem): OutboxItem[] {
  const last = items.at(-1);
  const isTextOnly = (entry: OutboxItem) =>
    entry.kind === "progress" && entry.request.enteredText !== undefined && !entry.request.status;
  if (last && isTextOnly(last) && isTextOnly(item) && last.kind === "progress" && item.kind === "progress") {
    const enteredText = { ...last.request.enteredText, ...item.request.enteredText };
    return [...items.slice(0, -1), { ...item, request: { ...item.request, enteredText } }];
  }
  return [...items, item];
}
