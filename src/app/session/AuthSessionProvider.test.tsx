import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore, SESSION_TTL_MS, useAuthSession } from "@/entities/user";
import type { AuthSession } from "@/entities/user";

import { AuthSessionProvider } from "./AuthSessionProvider";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const ISSUED_AT = "2026-09-17T11:13:19+03:00";
const SESSION: AuthSession = {
  userId: "u-005",
  role: "student",
  token: "mock-u-005-abc",
  twoFactorUsed: true,
  issuedAt: ISSUED_AT,
};

function SessionProbe() {
  const session = useAuthSession();
  return <span data-testid="probe">{session ? session.userId : "нет сессии"}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(ISSUED_AT));
  sessionStore.set(SESSION);
  replaceMock.mockClear();
});

afterEach(() => {
  sessionStore.clear();
  vi.useRealTimers();
});

describe("AuthSessionProvider", () => {
  it("отдаёт сессию клиентским компонентам (useAuthSession)", () => {
    render(
      <AuthSessionProvider session={SESSION}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("u-005");
  });

  it("через 24 ч: стор сброшен, редирект на /login?reason=expired", () => {
    render(
      <AuthSessionProvider session={SESSION}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    act(() => {
      vi.advanceTimersByTime(SESSION_TTL_MS - 1);
    });
    expect(replaceMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(sessionStore.get()).toBeNull();
    expect(screen.getByTestId("probe")).toHaveTextContent("нет сессии");
    expect(replaceMock).toHaveBeenCalledWith("/login?reason=expired");
  });

  it("unmount останавливает отсчёт", () => {
    const { unmount } = render(
      <AuthSessionProvider session={SESSION}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
