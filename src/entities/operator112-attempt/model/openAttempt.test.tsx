import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { getOpenAttempt, setOpenAttempt, useOpenAttempt } from "./openAttempt";

afterEach(() => act(() => setOpenAttempt(null)));

describe("реестр открытой попытки", () => {
  it("хук видит отметку и её снятие", () => {
    const { result } = renderHook(() => useOpenAttempt());
    expect(result.current).toBeNull();
    act(() => setOpenAttempt({ title: "Билет 112" }));
    expect(result.current).toEqual({ title: "Билет 112" });
    act(() => setOpenAttempt(null));
    expect(result.current).toBeNull();
  });

  it("повтор той же отметки не плодит обновлений", () => {
    setOpenAttempt({ title: "A" });
    const first = getOpenAttempt();
    setOpenAttempt({ title: "A" });
    expect(getOpenAttempt()).toBe(first);
  });
});
