import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sessionStore } from "@/entities/user";
import { ApiError } from "@/shared/api";
import type { AuthSession, LoginRequest } from "@/shared/api";

import { AuthForm } from "./AuthForm";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

const TEACHER_SESSION: AuthSession = {
  userId: "u-002",
  role: "teacher",
  token: "mock-u-002-1",
  twoFactorUsed: false,
  issuedAt: new Date().toISOString(),
};

type LoginFake = ReturnType<typeof vi.fn<(request: LoginRequest) => Promise<AuthSession>>>;

function resolvesWith(session: AuthSession): LoginFake {
  return vi.fn(async () => session);
}

function rejectsWith(status: number, message: string): LoginFake {
  return vi.fn(async () => {
    throw new ApiError(status, status === 403 ? "accountBlocked" : "unauthorized", message);
  });
}

async function submitCredentials(login: string, password: string, armNumber: string, viaEnter = false) {
  fireEvent.change(screen.getByLabelText(/логин/i), { target: { value: login } });
  fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/номер АРМ/i), { target: { value: armNumber } });
  await act(async () => {
    if (viaEnter) fireEvent.submit(screen.getByLabelText(/номер АРМ/i).closest("form")!);
    else fireEvent.click(screen.getByRole("button", { name: "ВОЙТИ" }));
  });
}

describe("AuthForm", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    sessionStore.clear();
  });

  it("содержит поля «Логин», «Пароль», «Номер АРМ» и кнопку «ВОЙТИ»", () => {
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} />);
    expect(screen.getByLabelText(/логин/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/пароль/i)).toHaveAttribute("type", "password");
    expect(screen.getByLabelText(/номер АРМ/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ВОЙТИ" })).toBeInTheDocument();
  });

  it("submit по Enter отправляет логин/пароль/номер АРМ и завершает вход", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", "21", true);
    expect(loginFake).toHaveBeenCalledWith({ login: "morozova", password: "teacher112", armNumber: 21 });
    expect(sessionStore.get()).toMatchObject({ userId: "u-002", twoFactorUsed: false });
  });

  it("клавиша Enter в поле отправляет форму", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    fireEvent.change(screen.getByLabelText(/логин/i), { target: { value: "morozova" } });
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: "teacher112" } });
    fireEvent.change(screen.getByLabelText(/номер АРМ/i), { target: { value: "21" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/номер АРМ/i), { key: "Enter" });
    });
    expect(loginFake).toHaveBeenCalledWith({ login: "morozova", password: "teacher112", armNumber: 21 });
    expect(sessionStore.get()).toMatchObject({ userId: "u-002" });
  });

  it("сессия и редирект создаются после одного запроса", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", "21");
    expect(loginFake).toHaveBeenCalledTimes(1);
    expect(sessionStore.get()).toMatchObject({ userId: "u-002", twoFactorUsed: false });
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("returnUrl гварда: после входа возврат на запрошенный URL", async () => {
    const studentSession: AuthSession = { ...TEACHER_SESSION, userId: "u-005", role: "student" };
    render(<AuthForm loginRequest={resolvesWith(studentSession)} returnUrl="/arm/card/card-881412" />);
    await submitCredentials("ivanov", "student112", "1");
    expect(replaceMock).toHaveBeenCalledWith("/arm/card/card-881412");
  });

  it("401 из мок-ответа — «Неверный логин или пароль» под формой, без сессии", async () => {
    render(<AuthForm loginRequest={rejectsWith(401, "Неверный логин или пароль")} />);
    await submitCredentials("ivanov", "wrong", "1");
    expect(screen.getByRole("alert")).toHaveTextContent("Неверный логин или пароль");
    expect(sessionStore.get()).toBeNull();
  });

  it("403 из мок-ответа — сообщение блокировки, сессия не создаётся, перехода нет", async () => {
    render(<AuthForm loginRequest={rejectsWith(403, "blocked")} />);
    await submitCredentials("egorov", "student112", "6");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Учётная запись заблокирована. Обратитесь к администратору",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Неверный логин");
    expect(sessionStore.get()).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("номер АРМ не число — подсказка без запроса к серверу", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", "");
    expect(screen.getByRole("alert")).toHaveTextContent("Укажите номер АРМ");
    expect(loginFake).not.toHaveBeenCalled();
  });

  it("pending: кнопка неактивна, пока идёт запрос", async () => {
    let resolveLogin: (session: AuthSession) => void = () => undefined;
    const pendingLogin = vi.fn(() => new Promise<AuthSession>((resolve) => (resolveLogin = resolve)));
    render(<AuthForm loginRequest={pendingLogin} />);
    await submitCredentials("morozova", "teacher112", "21");
    expect(screen.getByRole("button", { name: "ВОЙТИ" })).toBeDisabled();
    await act(async () => resolveLogin(TEACHER_SESSION));
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });
});
