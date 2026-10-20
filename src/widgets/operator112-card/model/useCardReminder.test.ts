import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Clock, TimerHandle } from "@/shared/lib";

import { isReminderMinutes, useCardReminder } from "./useCardReminder";

const MINUTE = 60_000;

/** Часы с ручным ходом времени: таймеры срабатывают в advance(), когда наступает их срок. */
function fakeClock(startMs = Date.parse("2026-09-29T10:00:00+03:00")) {
  let now = startMs;
  let nextId = 1;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const clock: Clock = {
    now: () => now,
    setTimeout: (callback, delayMs) => {
      const id = nextId;
      nextId += 1;
      timers.set(id, { at: now + delayMs, callback });
      return id as unknown as TimerHandle;
    },
    clearTimeout: (handle) => {
      timers.delete(handle as unknown as number);
    },
  };
  return {
    clock,
    pending: () => timers.size,
    advance(ms: number) {
      now += ms;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at);
      for (const [id, timer] of due) {
        timers.delete(id);
        timer.callback();
      }
    },
  };
}

function setup() {
  const fake = fakeClock();
  const hook = renderHook(() => useCardReminder(fake.clock));
  /** Действия меняют состояние — выполняются внутри act, чтобы эффекты таймера успели отработать. */
  const call = <T,>(fn: () => T): T => {
    let value!: T;
    act(() => {
      value = fn();
    });
    return value;
  };
  const tick = (ms: number) => act(() => fake.advance(ms));
  return { fake, hook, call, tick };
}

describe("isReminderMinutes", () => {
  it("целое от 1; ноль, дробные, отрицательные и NaN — нет", () => {
    expect(isReminderMinutes(1)).toBe(true);
    expect([0, -1, 1.5, Number.NaN].some(isReminderMinutes)).toBe(false);
  });
});

describe("useCardReminder", () => {
  it("поставить на 2 минуты: до срока не срабатывает, в срок — окно", () => {
    const { hook, call, tick } = setup();
    expect(call(() => hook.result.current.set(2, "перезвонить заявителю"))).toBe(true);
    expect(hook.result.current.reminder?.text).toBe("перезвонить заявителю");
    tick(2 * MINUTE - 1000);
    expect(hook.result.current.isDue).toBe(false);
    tick(1000);
    expect(hook.result.current.isDue).toBe(true);
  });

  it("неверные минуты и пустой текст не ставят напоминание", () => {
    const { hook, call } = setup();
    expect(call(() => hook.result.current.set(0, "x"))).toBe(false);
    expect(call(() => hook.result.current.set(1.5, "x"))).toBe(false);
    expect(call(() => hook.result.current.set(1, "   "))).toBe(false);
    expect(hook.result.current.reminder).toBeNull();
  });

  it("«напомнить позже» на N минут: окно закрывается, текст сохраняется, срабатывает снова", () => {
    const { hook, call, tick } = setup();
    call(() => hook.result.current.set(1, "перезвонить"));
    tick(MINUTE);
    expect(hook.result.current.isDue).toBe(true);
    expect(call(() => hook.result.current.snooze(3))).toBe(true);
    expect(hook.result.current.isDue).toBe(false);
    expect(hook.result.current.reminder?.text).toBe("перезвонить");
    tick(3 * MINUTE - 1000);
    expect(hook.result.current.isDue).toBe(false);
    tick(1000);
    expect(hook.result.current.isDue).toBe(true);
  });

  it("«напомнить позже» без напоминания или с неверными минутами — false", () => {
    const { hook, call } = setup();
    expect(call(() => hook.result.current.snooze(3))).toBe(false);
    call(() => hook.result.current.set(1, "x"));
    expect(call(() => hook.result.current.snooze(0))).toBe(false);
  });

  it("удалить: напоминание и окно сняты, отложенный срабатывание отменено", () => {
    const { fake, hook, call, tick } = setup();
    call(() => hook.result.current.set(1, "x"));
    tick(MINUTE);
    call(() => hook.result.current.remove());
    expect(hook.result.current.reminder).toBeNull();
    expect(hook.result.current.isDue).toBe(false);
    expect(fake.pending()).toBe(0);
  });

  it("новое напоминание сбрасывает окно прежнего", () => {
    const { hook, call, tick } = setup();
    call(() => hook.result.current.set(1, "первое"));
    tick(MINUTE);
    expect(hook.result.current.isDue).toBe(true);
    call(() => hook.result.current.set(5, "второе"));
    expect(hook.result.current.isDue).toBe(false);
    expect(hook.result.current.reminder?.text).toBe("второе");
  });

  it("размонтирование экрана снимает таймер напоминания", () => {
    const { fake, hook, call } = setup();
    call(() => hook.result.current.set(1, "x"));
    expect(fake.pending()).toBe(1);
    hook.unmount();
    expect(fake.pending()).toBe(0);
  });
});
