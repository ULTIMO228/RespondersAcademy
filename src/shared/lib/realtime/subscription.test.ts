/* T3.3-02: транспорт (SSE → long-poll), тики окна (since, at], автопереподключение, снятие подписки. */
import { describe, expect, it, vi } from "vitest";

import { createConnectivity } from "../network";
import type { ConnectivitySource } from "../network";
import type { Clock, TimerHandle } from "../clock";
import { createFeedSubscription } from "./subscription";
import type { FeedPage } from "./state";
import { FEED_MAX_RETRY_MS, FEED_RETRY_MS, FEED_TICK_MS, pickFeedTransport } from "./transport";
import type { EventStream } from "./transport";

type Task = { run: () => void; delayMs: number };

/** Управляемые часы: тик выполняется вручную, реального ожидания в тестах нет. */
function createTestClock() {
  const tasks = new Map<number, Task>();
  let nextId = 1;
  const clock: Clock = {
    now: () => 0,
    setTimeout: (callback, delayMs) => {
      const id = nextId++;
      tasks.set(id, { run: callback, delayMs });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      tasks.delete(handle as unknown as number);
    },
  };
  const runNext = async () => {
    const [id, task] = [...tasks.entries()][0] ?? [];
    if (id === undefined || !task) return undefined;
    tasks.delete(id);
    task.run();
    await Promise.resolve();
    await Promise.resolve();
    return task.delayMs;
  };
  return { clock, runNext, size: () => tasks.size };
}

const onlineSource: ConnectivitySource = { isOnline: () => true, subscribe: () => () => undefined };

function page(at: string, events: string[] = []): FeedPage<string> {
  return { at, events };
}

function setup(fetchPage: (since: string | undefined) => Promise<FeedPage<string>>) {
  const testClock = createTestClock();
  const connectivity = createConnectivity(onlineSource);
  const pages: FeedPage<string>[] = [];
  const states: boolean[] = [];
  const subscription = createFeedSubscription<string>({
    fetchPage: (since) => fetchPage(since),
    onEvents: (received) => pages.push(received),
    onStateChange: (state) => states.push(state.isOnline),
    deps: { clock: testClock.clock, connectivity },
  });
  return { testClock, connectivity, pages, states, subscription };
}

describe("pickFeedTransport", () => {
  it("без фабрики потока — long-poll; с фабрикой — SSE", () => {
    expect(pickFeedTransport({})).toBe("longPoll");
    expect(pickFeedTransport({ createEventStream: () => ({}) as unknown as EventStream })).toBe("sse");
  });
});

describe("createFeedSubscription — long-poll", () => {
  it("первый тик без since, следующий — с курсором предыдущего at", async () => {
    const seen: (string | undefined)[] = [];
    const fetchPage = vi.fn(async (since: string | undefined) => {
      seen.push(since);
      return page(`t${seen.length}`, [`e${seen.length}`]);
    });
    const { testClock, pages, subscription } = setup(fetchPage);
    await Promise.resolve();
    await Promise.resolve();
    expect(seen).toEqual([undefined]);
    await testClock.runNext();
    expect(seen).toEqual([undefined, "t1"]);
    expect(pages.map((item) => item.at)).toEqual(["t1", "t2"]);
    subscription.stop();
  });

  it("сбой сети → offline и повтор с тем же курсором; восстановление догоняет события", async () => {
    let failures = 2;
    const seen: (string | undefined)[] = [];
    const fetchPage = vi.fn(async (since: string | undefined) => {
      seen.push(since);
      if (seen.length === 1) return page("t1");
      if (failures-- > 0) throw new Error("network");
      return page("t2", ["догнали"]);
    });
    const { testClock, connectivity, pages, states, subscription } = setup(fetchPage);
    await Promise.resolve();
    await Promise.resolve();
    /* Тик по расписанию упал → пауза FEED_RETRY_MS; второй сбой удваивает её. */
    expect(await testClock.runNext()).toBe(FEED_TICK_MS);
    expect(connectivity.isOnline()).toBe(false);
    expect(states).toContain(false);
    expect(await testClock.runNext()).toBe(FEED_RETRY_MS);
    expect(await testClock.runNext()).toBe(FEED_RETRY_MS * 2);
    expect(connectivity.isOnline()).toBe(true);
    /* Курсор не сдвинулся на сбоях — окно догнано целиком. */
    expect(seen.slice(1)).toEqual(["t1", "t1", "t1"]);
    expect(pages.at(-1)?.events).toEqual(["догнали"]);
    expect(FEED_RETRY_MS * 2).toBeLessThanOrEqual(FEED_MAX_RETRY_MS);
    subscription.stop();
  });

  it("stop снимает подписку: таймеров не остаётся, ответ после остановки игнорируется", async () => {
    const fetchPage = vi.fn(async () => page("t1"));
    const { testClock, pages, subscription } = setup(fetchPage);
    await Promise.resolve();
    await Promise.resolve();
    subscription.stop();
    expect(testClock.size()).toBe(0);
    const before = pages.length;
    await testClock.runNext();
    expect(pages).toHaveLength(before);
  });
});
