import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import { createConnectivity, createMemoryStorage } from "@/shared/lib";

import type { OutboxItem } from "../lib/outbox";
import { AMEND_BLOCKED_NOTICE, AMEND_RELEASED_NOTICE, useAmendMode } from "./useAmendMode";
import { useCardHotkeys } from "./useCardHotkeys";
import { RECONNECT_PROBE_MS, useConnection } from "./useConnection";
import { useOutbox } from "./useOutbox";
import { useProcessingTimer } from "./useProcessingTimer";

const OPENED_AT = "2026-09-20T10:00:00+03:00";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(OPENED_AT));
});
afterEach(() => vi.useRealTimers());

describe("useProcessingTimer (T2.3-04)", () => {
  it("тикает от открытия; 3:00 — норма, 3:01 — превышение; завершение останавливает", () => {
    const { result, rerender } = renderHook(
      (props: { completedAt: string | null }) =>
        useProcessingTimer({ openedAt: OPENED_AT, completedAt: props.completedAt, normMs: 180_000 }),
      { initialProps: { completedAt: null as string | null } },
    );
    expect(result.current.value).toBe("0:00");
    act(() => {
      vi.advanceTimersByTime(180_000);
    });
    expect(result.current).toMatchObject({ value: "3:00", isExceeded: false });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(result.current).toMatchObject({ value: "3:01", isExceeded: true });
    rerender({ completedAt: "2026-09-20T10:02:10+03:00" });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toMatchObject({ value: "2:10", isExceeded: false, elapsedMs: 130_000 });
  });
});

describe("useAmendMode (T2.3-15)", () => {
  it("блокировка другим пользователем → уведомление; снятие флага → обратное уведомление", () => {
    const onSave = vi.fn();
    const { result } = renderHook(() =>
      useAmendMode({ lockSeconds: 5, initialDescription: "Текст СМС", onSave }),
    );
    expect(result.current).toMatchObject({
      isBlocked: true,
      notice: AMEND_BLOCKED_NOTICE,
      description: "Текст СМС",
    });
    act(() => result.current.onStart());
    act(() => result.current.onSave());
    expect(onSave).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toMatchObject({ isBlocked: false, notice: AMEND_RELEASED_NOTICE });
    act(() => result.current.onSave());
    expect(onSave).toHaveBeenCalledWith("Текст СМС", "");
    expect(result.current.isActive).toBe(false);
  });
});

describe("useOutbox + useConnection (T2.3-20)", () => {
  const item: OutboxItem = {
    id: "1",
    kind: "progress",
    attemptId: "att-1",
    request: { enteredText: { a: "b" } },
  };

  it("сетевой сбой → в буфер и offline; проба мок-слоя → online → досылка, буфер пуст", async () => {
    const connectivity = createConnectivity({ isOnline: () => true, subscribe: () => () => undefined });
    let isNetworkDown = true;
    const send = vi.fn(async () => {
      if (isNetworkDown) throw new ApiError(0, "networkError", "Нет соединения с сервером");
      return { id: "att-1" } as never;
    });
    const probe = vi.fn(async () => {
      if (isNetworkDown) throw new Error("offline");
    });
    const storage = createMemoryStorage();
    const { result } = renderHook(() => {
      const isOnline = useConnection({ probe, connectivity });
      return { isOnline, outbox: useOutbox({ storage, storageKey: "k", isOnline, connectivity, send }) };
    });
    await act(async () => {
      expect(await result.current.outbox.dispatch(item)).toBeNull();
    });
    expect(result.current.isOnline).toBe(false);
    expect(result.current.outbox.pendingCount).toBe(1);
    expect(storage.get("k")).not.toBeNull();
    isNetworkDown = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_PROBE_MS);
    });
    expect(result.current.isOnline).toBe(true);
    expect(result.current.outbox.pendingCount).toBe(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(storage.get("k")).toBeNull();
  });

  it("сбой 30 сек: ввод за время обрыва не теряется и досылается в исходном порядке (ТЗ §7)", async () => {
    const connectivity = createConnectivity({ isOnline: () => true, subscribe: () => () => undefined });
    let isNetworkDown = true;
    const sent: string[] = [];
    const send = vi.fn(async (pending: OutboxItem) => {
      if (isNetworkDown) throw new ApiError(0, "networkError", "Нет соединения с сервером");
      sent.push(pending.id);
      return { id: "att-1" } as never;
    });
    const probe = vi.fn(async () => {
      if (isNetworkDown) throw new Error("offline");
    });
    const storage = createMemoryStorage();
    const { result } = renderHook(() => {
      const isOnline = useConnection({ probe, connectivity });
      return { isOnline, outbox: useOutbox({ storage, storageKey: "k", isOnline, connectivity, send }) };
    });

    // Обрыв: три разных действия за 30 секунд без связи (текст схлопывается — берём отработки).
    for (const id of ["1", "2", "3"]) {
      await act(async () => {
        await result.current.outbox.dispatch({
          id,
          kind: "workline",
          cardId: "card-36814845",
          request: {
            service: "Служба 101",
            calledTo: "Служба 101, 112",
            person: "Дежурный",
            message: `Отработка ${id}`,
            confirmed: true,
          },
        });
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
    }
    expect(result.current.isOnline).toBe(false);
    expect(result.current.outbox.pendingCount).toBe(3);
    expect(storage.get("k")).not.toBeNull();

    isNetworkDown = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONNECT_PROBE_MS);
    });
    expect(result.current.isOnline).toBe(true);
    expect(result.current.outbox.pendingCount).toBe(0);
    expect(sent).toEqual(["1", "2", "3"]);
    expect(storage.get("k")).toBeNull();
  });
});

function HotkeysProbe(props: Parameters<typeof useCardHotkeys>[0]) {
  const { isAltHeld } = useCardHotkeys(props);
  return (
    <div>
      <input aria-label="поле" />
      {isAltHeld ? <span>подсказки</span> : null}
    </div>
  );
}

describe("useCardHotkeys (T2.3-19)", () => {
  it("хоткеи не срабатывают внутри полей ввода; Alt+T и Insert — без действия; Alt+S — «Завершить»", () => {
    const handlers = { onClose: vi.fn(), onView: vi.fn(), onAmend: vi.fn(), onFinish: vi.fn() };
    render(<HotkeysProbe {...handlers} />);
    const field = screen.getByLabelText("поле");
    fireEvent.keyDown(field, { key: "Escape" });
    fireEvent.keyDown(field, { key: "F2", shiftKey: true });
    fireEvent.keyDown(document, { key: "t", code: "KeyT", altKey: true });
    fireEvent.keyDown(document, { key: "Insert" });
    expect(handlers.onClose).not.toHaveBeenCalled();
    expect(handlers.onAmend).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "s", code: "KeyS", altKey: true });
    expect(handlers.onFinish).toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Alt", altKey: true });
    expect(screen.getByText("подсказки")).toBeInTheDocument();
    fireEvent(window, new Event("blur"));
    expect(screen.queryByText("подсказки")).toBeNull();
  });
});
