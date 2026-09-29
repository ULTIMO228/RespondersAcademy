import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SharedApi from "@/shared/api";

import { LogoutLink } from "./LogoutLink";

const logoutMock = vi.hoisted(() => vi.fn());

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  logout: logoutMock,
}));

beforeEach(() => {
  logoutMock.mockReset();
});

describe("LogoutLink", () => {
  it("клик «выйти» просит сервер завершить сессию; ссылка ведёт на /login", () => {
    logoutMock.mockResolvedValue(undefined);
    render(<LogoutLink title="Выйти">выйти</LogoutLink>);
    const link = screen.getByRole("link", { name: "выйти" });
    expect(link).toHaveAttribute("href", "/login");
    fireEvent.click(link);
    expect(logoutMock).toHaveBeenCalledTimes(1);
  });

  it("сбой запроса выхода не блокирует ссылку и не бросает ошибку", async () => {
    logoutMock.mockRejectedValue(new Error("Нет соединения"));
    const onClick = vi.fn();
    render(<LogoutLink onClick={onClick}>выйти</LogoutLink>);
    fireEvent.click(screen.getByRole("link", { name: "выйти" }));
    await vi.waitFor(() => expect(logoutMock).toHaveBeenCalled());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("клик не читает и не пишет cookie сессии в браузере", () => {
    logoutMock.mockResolvedValue(undefined);
    render(<LogoutLink>выйти</LogoutLink>);
    fireEvent.click(screen.getByRole("link", { name: "выйти" }));
    expect(document.cookie).not.toContain("arm112_session");
  });
});
