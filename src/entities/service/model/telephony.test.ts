import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CARD_CLOSE_HOLD_MS, createTelephonyStore, TELEPHONY_STATUS_TITLES } from "./telephony";
import { useCardTelephonyHold, useTelephonyStatus } from "./useTelephony";

describe("telephony store (T2.3-02)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("подписи четырёх статусов дословно", () => {
    expect(Object.values(TELEPHONY_STATUS_TITLES)).toEqual([
      "доступен",
      "недоступен",
      "не подключен",
      "ошибка",
    ]);
  });

  it("открытие карточки → «недоступен», закрытие → удержание 10 сек → «доступен»", () => {
    const store = createTelephonyStore();
    store.cardOpened();
    expect(store.getStatus()).toBe("unavailable");
    store.cardClosed();
    vi.advanceTimersByTime(CARD_CLOSE_HOLD_MS - 1);
    expect(store.getStatus()).toBe("unavailable");
    vi.advanceTimersByTime(1);
    expect(store.getStatus()).toBe("available");
  });

  it("новая карточка в период удержания отменяет возврат в «доступен»", () => {
    const store = createTelephonyStore();
    store.cardOpened();
    store.cardClosed();
    vi.advanceTimersByTime(CARD_CLOSE_HOLD_MS / 2);
    store.cardOpened();
    vi.advanceTimersByTime(CARD_CLOSE_HOLD_MS);
    expect(store.getStatus()).toBe("unavailable");
  });

  it("ручное переключение по кругу; технические состояния автоматикой не перезаписываются", () => {
    const store = createTelephonyStore();
    store.cycleStatus();
    expect(store.getStatus()).toBe("unavailable");
    store.cycleStatus();
    expect(store.getStatus()).toBe("disconnected");
    store.cardOpened();
    expect(store.getStatus()).toBe("disconnected");
    store.setStatus("error");
    store.cycleStatus();
    expect(store.getStatus()).toBe("available");
  });

  it("хуки: карточка держит «недоступен», unmount запускает удержание и очищает таймер", () => {
    const store = createTelephonyStore();
    const status = renderHook(() => useTelephonyStatus(store));
    const hold = renderHook(() => useCardTelephonyHold(true, store));
    expect(status.result.current).toBe("unavailable");
    hold.unmount();
    act(() => {
      vi.advanceTimersByTime(CARD_CLOSE_HOLD_MS);
    });
    expect(status.result.current).toBe("available");
    expect(vi.getTimerCount()).toBe(0);
  });
});
