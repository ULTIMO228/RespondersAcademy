import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { systemClock } from "@/shared/lib";

import { createTicker } from "./ticker";

describe("createTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T10:00:00+03:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("вызывает onTick раз в секунду с текущим временем часов и останавливается", () => {
    const onTick = vi.fn();
    const stop = createTicker(systemClock, onTick);
    vi.advanceTimersByTime(3000);
    expect(onTick).toHaveBeenCalledTimes(3);
    expect(onTick.mock.calls[2][0]).toBe(Date.now());
    stop();
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(3);
  });

  it("остановка внутри тика не даёт следующего вызова", () => {
    let stop = () => {};
    const onTick = vi.fn(() => stop());
    stop = createTicker(systemClock, onTick, 500);
    vi.advanceTimersByTime(5000);
    expect(onTick).toHaveBeenCalledTimes(1);
  });
});
