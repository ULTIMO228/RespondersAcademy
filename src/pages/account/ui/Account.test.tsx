import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SessionProvider } from "@/entities/user";
import type * as SharedApi from "@/shared/api";
import type { PublicUser } from "@/shared/api";

import { AccountProfilePage } from "./AccountProfilePage";
import { AccountSecurityPage } from "./AccountSecurityPage";

const replaceMock = vi.fn();
const logoutAllMock = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: replaceMock, push: vi.fn() }) }));
vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  logoutAll: () => logoutAllMock(),
  getAuthPolicy: vi
    .fn()
    .mockResolvedValue({ twoFactorRequired: false, minPasswordLength: 8, lockAfterAttempts: 5 }),
}));

const STUDENT = {
  id: "u-005",
  login: "ivanov",
  fullName: "Иванов Иван Иванович",
  role: "student",
  armNumber: 1,
  isActive: true,
  group: "Группа 1",
} as PublicUser;

describe("Профиль", () => {
  it("показывает данные пользователя из сессии без пароля и номера АРМ", () => {
    render(
      <SessionProvider user={STUDENT}>
        <AccountProfilePage />
      </SessionProvider>,
    );
    expect(screen.getByText("Иванов Иван Иванович")).toBeInTheDocument();
    expect(screen.getByText("ivanov")).toBeInTheDocument();
    expect(screen.getByText("Обучающийся")).toBeInTheDocument();
    expect(screen.getByText("Группа 1")).toBeInTheDocument();
    expect(screen.queryByText(/АРМ/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Безопасность" })).toHaveAttribute("href", "/account/security");
  });

  it("без пользователя — пустое состояние", () => {
    render(<AccountProfilePage />);
    expect(screen.getByText("Профиль недоступен")).toBeInTheDocument();
  });
});

describe("Безопасность", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    logoutAllMock.mockReset();
  });

  it("«Выйти на всех устройствах» требует подтверждения; после — вход", async () => {
    logoutAllMock.mockResolvedValue(undefined);
    render(<AccountSecurityPage />);
    expect(screen.getByRole("form", { name: "Смена пароля" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выйти на всех устройствах" }));
    expect(logoutAllMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Да, выйти везде" }));
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/login"));
    expect(logoutAllMock).toHaveBeenCalledTimes(1);
  });

  it("«Отмена» возвращает к кнопке без запроса", () => {
    render(<AccountSecurityPage />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти на всех устройствах" }));
    fireEvent.click(screen.getByRole("button", { name: "Отмена" }));
    expect(screen.getByRole("button", { name: "Выйти на всех устройствах" })).toBeInTheDocument();
    expect(logoutAllMock).not.toHaveBeenCalled();
  });

  it("ошибка сервера при выходе не уводит на вход и показывает сообщение", async () => {
    logoutAllMock.mockRejectedValue(new Error("offline"));
    render(<AccountSecurityPage />);
    fireEvent.click(screen.getByRole("button", { name: "Выйти на всех устройствах" }));
    fireEvent.click(screen.getByRole("button", { name: "Да, выйти везде" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось завершить сессии");
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
