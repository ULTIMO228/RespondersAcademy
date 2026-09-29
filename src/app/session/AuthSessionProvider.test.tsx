import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionUser } from "@/entities/user";
import type { PublicUser } from "@/entities/user";
import { ApiError, createApiClient, setUnauthorizedHandler } from "@/shared/api";

import { AuthSessionProvider } from "./AuthSessionProvider";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

const USER: PublicUser = {
  id: "u-005",
  login: "ivanov",
  fullName: "Иванов Сергей Петрович",
  role: "student",
  armNumber: 1,
  isActive: true,
};

function SessionProbe() {
  const user = useSessionUser();
  return <span data-testid="probe">{user ? user.id : "нет сессии"}</span>;
}

function respondWith(status: number) {
  return createApiClient({
    baseUrl: "/api/mock",
    fetcher: vi.fn(async () => new Response(status === 204 ? null : "{}", { status })),
  });
}

beforeEach(() => {
  replaceMock.mockClear();
  window.history.replaceState(null, "", "/student/assignments?tab=1");
});

afterEach(() => {
  setUnauthorizedHandler(null);
});

describe("AuthSessionProvider", () => {
  it("отдаёт пользователя сессии клиентским компонентам (useSessionUser)", () => {
    render(
      <AuthSessionProvider user={USER}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    expect(screen.getByTestId("probe")).toHaveTextContent("u-005");
  });

  it("401 любого запроса уводит на /login «Сессия истекла» с возвратом на текущую страницу", async () => {
    render(
      <AuthSessionProvider user={USER}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await expect(respondWith(401).get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledWith(
      "/login?returnUrl=%2Fstudent%2Fassignments%3Ftab%3D1&reason=expired",
    );
    await expect(respondWith(401).get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(replaceMock).toHaveBeenCalledTimes(1);
  });

  it("401 входа и выхода — штатный ответ, а не «сессия истекла»", async () => {
    render(
      <AuthSessionProvider user={USER}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await expect(respondWith(401).post("/auth/login", {})).rejects.toBeInstanceOf(ApiError);
    await expect(respondWith(401).post("/auth/logout")).rejects.toBeInstanceOf(ApiError);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("другие ошибки (403, 500) не считаются потерей сессии; unmount снимает обработчик", async () => {
    const { unmount } = render(
      <AuthSessionProvider user={USER}>
        <SessionProbe />
      </AuthSessionProvider>,
    );
    await expect(respondWith(403).get("/me")).rejects.toBeInstanceOf(ApiError);
    await expect(respondWith(500).get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(replaceMock).not.toHaveBeenCalled();
    unmount();
    await expect(respondWith(401).get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
