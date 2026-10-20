import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { isProblemReportHotkey, useProblemReportHotkey } from "./useProblemReportHotkey";

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

afterEach(() => vi.restoreAllMocks());

describe("Alt+M — «Сообщить о проблеме»", () => {
  it("Alt+M открывает окно и гасит системное действие клавиши", () => {
    const onOpen = vi.fn();
    renderHook(() => useProblemReportHotkey(onOpen));
    const event = press({ code: "KeyM", altKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("без Alt, с Shift или Ctrl/Meta, а также другая клавиша — не срабатывает", () => {
    const onOpen = vi.fn();
    renderHook(() => useProblemReportHotkey(onOpen));
    press({ code: "KeyM" });
    press({ code: "KeyM", altKey: true, shiftKey: true });
    press({ code: "KeyM", altKey: true, ctrlKey: true });
    press({ code: "KeyM", altKey: true, metaKey: true });
    press({ code: "KeyN", altKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("enabled = false — сочетание не слушается; после размонтирования слушатель снят", () => {
    const onOpen = vi.fn();
    const { unmount, rerender } = renderHook(
      ({ on }: { on: boolean }) => useProblemReportHotkey(onOpen, on),
      {
        initialProps: { on: false },
      },
    );
    press({ code: "KeyM", altKey: true });
    expect(onOpen).not.toHaveBeenCalled();
    rerender({ on: true });
    press({ code: "KeyM", altKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
    unmount();
    press({ code: "KeyM", altKey: true });
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("isProblemReportHotkey: код клавиши, а не символ — русская раскладка тоже подходит", () => {
    expect(
      isProblemReportHotkey({ code: "KeyM", altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBe(true);
    expect(
      isProblemReportHotkey({ code: "KeyM", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false }),
    ).toBe(false);
  });
});
