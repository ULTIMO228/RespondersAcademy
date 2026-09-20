import type { KeyValueStorage } from "@/shared/lib";

/* JSON-значения ленты в хранилище (localStorage): битые данные не ломают экран — берётся запасное значение. */

export const STORAGE_KEYS = {
  activeSession: "arm112.journal.activeSession",
  important: "arm112.journal.important",
  reminders: "arm112.journal.reminders",
  reactions: "arm112.journal.reactions",
} as const;

export function readStored<TValue>(storage: KeyValueStorage, key: string, fallback: TValue): TValue {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as TValue;
  } catch {
    return fallback;
  }
}

export function writeStored(storage: KeyValueStorage, key: string, value: unknown): void {
  if (value === null || value === undefined) storage.remove(key);
  else storage.set(key, JSON.stringify(value));
}
