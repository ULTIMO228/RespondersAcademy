import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";

import type { PasswordChangeApi } from "../model/usePasswordChange";
import { PasswordChangeForm } from "./PasswordChangeForm";

function makeApi(overrides: Partial<PasswordChangeApi> = {}): PasswordChangeApi {
  return {
    changePassword: vi.fn().mockResolvedValue(undefined),
    loadMinLength: vi.fn().mockResolvedValue(10),
    ...overrides,
  };
}

async function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText("Текущий пароль"), { target: { value: current } });
  fireEvent.change(screen.getByLabelText("Новый пароль"), { target: { value: next } });
  fireEvent.change(screen.getByLabelText("Повторите новый пароль"), { target: { value: confirm } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Сменить пароль" }));
  });
}

describe("PasswordChangeForm", () => {
  it("успех: запрос уходит с двумя паролями, поля очищаются, показано сообщение о завершении других сессий", async () => {
    const api = makeApi();
    render(<PasswordChangeForm api={api} />);
    await waitFor(() => expect(screen.getByText("Не менее 10 символов")).toBeInTheDocument());
    await fill("student112", "новый-пароль-42");
    expect(api.changePassword).toHaveBeenCalledWith({
      currentPassword: "student112",
      newPassword: "новый-пароль-42",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Пароль изменён");
    expect(screen.getByLabelText("Текущий пароль")).toHaveValue("");
  });

  it("слабый пароль (короче политики сервера) — ошибка у поля, запроса нет", async () => {
    const api = makeApi();
    render(<PasswordChangeForm api={api} />);
    await waitFor(() => expect(screen.getByText("Не менее 10 символов")).toBeInTheDocument());
    await fill("student112", "короткий1");
    expect(screen.getByText("Пароль должен содержать не менее 10 символов")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("подтверждение не совпадает — ошибка у поля подтверждения", async () => {
    const api = makeApi();
    render(<PasswordChangeForm api={api} />);
    await fill("student112", "новый-пароль-42", "другой-пароль-42");
    expect(screen.getByText("Пароли не совпадают")).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it("неверный текущий пароль (400 сервера) показан в форме и не выбрасывает из системы", async () => {
    const api = makeApi({
      changePassword: vi
        .fn()
        .mockRejectedValue(new ApiError(400, "validationFailed", "Неверный текущий пароль")),
    });
    render(<PasswordChangeForm api={api} />);
    await fill("wrong-password", "новый-пароль-42");
    expect(screen.getByRole("alert")).toHaveTextContent("Неверный текущий пароль");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("сбой сети — общее сообщение, форма остаётся заполненной", async () => {
    const api = makeApi({ changePassword: vi.fn().mockRejectedValue(new ApiError(500, "internal", "boom")) });
    render(<PasswordChangeForm api={api} />);
    await fill("student112", "новый-пароль-42");
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось изменить пароль");
    expect(screen.getByLabelText("Новый пароль")).toHaveValue("новый-пароль-42");
  });

  it("политика недоступна — действует длина по умолчанию (8)", async () => {
    const api = makeApi({ loadMinLength: vi.fn().mockRejectedValue(new Error("offline")) });
    render(<PasswordChangeForm api={api} />);
    expect(screen.getByText("Не менее 8 символов")).toBeInTheDocument();
  });

  it("поля пароля скрыты, токенов и паролей на клиенте не остаётся", async () => {
    render(<PasswordChangeForm api={makeApi()} />);
    for (const label of ["Текущий пароль", "Новый пароль", "Повторите новый пароль"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
    }
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });
});
