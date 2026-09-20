import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthSession } from "@/shared/api";

import { SESSION_TTL_MS } from "./session";
import { watchSessionExpiry } from "./session-expiry";

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const ISSUED_AT = "2026-09-17T11:13:19+03:00";

const SESSION: AuthSession = {
  userId: "u-005",
  role: "student",
  token: "mock-u-005-abc",
  twoFactorUsed: true,
  issuedAt: ISSUED_AT,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ISSUED_AT));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("watchSessionExpiry (автовыход 24 ч)", () => {
  it("TTL — 24 часа", () => {
    expect(SESSION_TTL_MS).toBe(24 * HOUR_MS);
  });

  it("до границы сессия живёт, на границе 24 ч — onExpire ровно один раз", () => {
    const onExpire = vi.fn();
    watchSessionExpiry({ session: SESSION, onExpire });
    vi.advanceTimersByTime(SESSION_TTL_MS - 1);
    expect(onExpire).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HOUR_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("issuedAt «25 часов назад» — сброс сразу", () => {
    vi.setSystemTime(new Date(Date.parse(ISSUED_AT) + 25 * HOUR_MS));
    const onExpire = vi.fn();
    watchSessionExpiry({ session: SESSION, onExpire });
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("часы «перескочили» (сон ноутбука) — истечение ловится ближайшей проверкой", () => {
    const onExpire = vi.fn();
    watchSessionExpiry({ session: SESSION, onExpire });
    vi.setSystemTime(new Date(Date.parse(ISSUED_AT) + SESSION_TTL_MS + MINUTE_MS));
    vi.advanceTimersByTime(MINUTE_MS);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it("остановка (unmount/выход) очищает таймер — утечек нет", () => {
    const onExpire = vi.fn();
    const stop = watchSessionExpiry({ session: SESSION, onExpire });
    expect(vi.getTimerCount()).toBe(1);
    stop();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(SESSION_TTL_MS * 2);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
