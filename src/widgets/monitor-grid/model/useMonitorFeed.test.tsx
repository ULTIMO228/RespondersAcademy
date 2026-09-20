/* T3.3-02: подписка мониторинга — курсор окна, накопление событий, снятие подписки при размонтировании. */
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { SessionFeedEvent } from "@/shared/api";

import { createTestApi, createTestClock, withDeps } from "./testDeps.testing";
import { useMonitorFeed } from "./useMonitorFeed";

const SESSION = "ses-1";

function event(at: string): SessionFeedEvent {
  return { kind: "cardIssued", at, studentId: "u-005", cardId: "c-095", level: 2 };
}

describe("useMonitorFeed", () => {
  it("накапливает события и двигает курсор since по at ответа", async () => {
    const getSessionFeed = vi
      .fn()
      .mockResolvedValueOnce({ sessionId: SESSION, at: "at-1", events: [event("t1")] })
      .mockResolvedValue({ sessionId: SESSION, at: "at-2", events: [event("t2")] });
    const api = createTestApi({ getSessionFeed });
    const testClock = createTestClock();
    const wrapper = ({ children }: { children: ReactNode }) =>
      withDeps({ api, clock: testClock.clock }, children);
    const { result, unmount } = renderHook(() => useMonitorFeed(SESSION), { wrapper });

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(getSessionFeed).toHaveBeenCalledWith(
      SESSION,
      { since: undefined, studentId: undefined },
      expect.any(AbortSignal),
    );
    await act(async () => {
      testClock.runAll();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.events).toHaveLength(2));
    expect(getSessionFeed).toHaveBeenLastCalledWith(
      SESSION,
      { since: "at-1", studentId: undefined },
      expect.any(AbortSignal),
    );
    expect(result.current.isOnline).toBe(true);

    /* Размонтирование снимает подписку: новых тиков и запросов нет. */
    unmount();
    const calls = getSessionFeed.mock.calls.length;
    act(() => testClock.runAll());
    expect(getSessionFeed).toHaveBeenCalledTimes(calls);
  });

  it("без занятия подписки нет", () => {
    const getSessionFeed = vi.fn();
    const api = createTestApi({ getSessionFeed });
    const testClock = createTestClock();
    const wrapper = ({ children }: { children: ReactNode }) =>
      withDeps({ api, clock: testClock.clock }, children);
    const { result } = renderHook(() => useMonitorFeed(null), { wrapper });
    expect(getSessionFeed).not.toHaveBeenCalled();
    expect(result.current.events).toEqual([]);
  });
});
