import { afterEach, describe, expect, it, vi } from "vitest";

import { createMemoryStorage } from "../storage";
import type { KeyValueStorage } from "../storage";
import { CHAT_HISTORY_LIMIT, chatHistoryKey, createChatHistoryStore } from "./index";

type Entry = { id: string; role: "user" | "assistant"; content: string };

function entries(count: number, prefix = "m"): Entry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}${index + 1}`,
    role: index % 2 === 0 ? "user" : "assistant",
    content: `реплика ${index + 1}`,
  }));
}

/** Хранилище, которое бросает на любой доступ: приватное окно, заблокированные данные сайта. */
const brokenStorage: KeyValueStorage = {
  get: () => {
    throw new DOMException("denied", "SecurityError");
  },
  set: () => {
    throw new DOMException("quota", "QuotaExceededError");
  },
  remove: () => {
    throw new DOMException("denied", "SecurityError");
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("история чата: ключ и хранение по попытке", () => {
  it("ключ — arm112_chat_attempt_{attemptId}", () => {
    expect(chatHistoryKey("att-02")).toBe("arm112_chat_attempt_att-02");
  });

  it("по умолчанию пишет в sessionStorage под ключом попытки и читает обратно", () => {
    const store = createChatHistoryStore<Entry>();
    store.save("att-02", entries(2));
    expect(JSON.parse(window.sessionStorage.getItem("arm112_chat_attempt_att-02") ?? "null")).toEqual(
      entries(2),
    );
    expect(store.load("att-02")).toEqual(entries(2));
  });

  it("истории разных попыток не смешиваются; clear очищает только свою", () => {
    const store = createChatHistoryStore<Entry>(createMemoryStorage());
    store.save("att-01", entries(1, "a"));
    store.save("att-02", entries(1, "b"));
    store.clear("att-01");
    expect(store.load("att-01")).toEqual([]);
    expect(store.load("att-02")).toEqual(entries(1, "b"));
  });
});

describe("история чата: лимит реплик", () => {
  it("лимит — 50 реплик", () => {
    expect(CHAT_HISTORY_LIMIT).toBe(50);
  });

  it("при 55 репликах хранятся последние 50: первая — шестая, последняя — пятьдесят пятая", () => {
    const store = createChatHistoryStore<Entry>(createMemoryStorage());
    store.save("att-02", entries(55));
    const loaded = store.load("att-02");
    expect(loaded).toHaveLength(50);
    expect(loaded[0].id).toBe("m6");
    expect(loaded[49].id).toBe("m55");
  });

  it("при чтении записи сверх лимита тоже отдаются только последние 50", () => {
    const storage = createMemoryStorage({ [chatHistoryKey("att-02")]: JSON.stringify(entries(60)) });
    const loaded = createChatHistoryStore<Entry>(storage).load("att-02");
    expect(loaded).toHaveLength(50);
    expect(loaded[0].id).toBe("m11");
  });
});

describe("история чата: недоступное хранилище не ломает чат", () => {
  it("исключения хранилища не выходят наружу: load → [], save и clear молчат", () => {
    const store = createChatHistoryStore<Entry>(brokenStorage);
    expect(store.load("att-02")).toEqual([]);
    expect(() => store.save("att-02", entries(1))).not.toThrow();
    expect(() => store.clear("att-02")).not.toThrow();
  });

  it("приватное окно (window.sessionStorage недоступен): чат работает без восстановления", () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const store = createChatHistoryStore<Entry>();
    expect(store.load("att-02")).toEqual([]);
    expect(() => store.save("att-02", entries(1))).not.toThrow();
    expect(() => store.clear("att-02")).not.toThrow();
  });

  it("повреждённая запись (не JSON, не массив, без id) читается как пустая история", () => {
    const storage = createMemoryStorage({ [chatHistoryKey("att-02")]: "{не json" });
    const store = createChatHistoryStore<Entry>(storage);
    expect(store.load("att-02")).toEqual([]);
    storage.set(chatHistoryKey("att-02"), '{"id":"x"}');
    expect(store.load("att-02")).toEqual([]);
    storage.set(chatHistoryKey("att-02"), JSON.stringify([{ role: "user" }, entries(1)[0]]));
    expect(store.load("att-02")).toEqual(entries(1));
  });
});
