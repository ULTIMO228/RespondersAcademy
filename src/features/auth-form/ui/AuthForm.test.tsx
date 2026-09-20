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
  twoFactorUsed: true,
  issuedAt: new Date().toISOString(),
};

type LoginFake = ReturnType<typeof vi.fn<(request: LoginRequest) => Promise<AuthSession>>>;

function resolvesWith(session: AuthSession): LoginFake {
  return vi.fn(async (request: LoginRequest) => ({
    ...session,
    twoFactorUsed: request.twoFactorCode !== undefined,
  }));
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

async function submitCode(code: string) {
  fireEvent.change(screen.getByLabelText(/код из сообщения/i), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "ВОЙТИ" }));
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

  it("submit по Enter отправляет логин/пароль/номер АРМ (число) в мок-клиент и открывает 2FA", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", "21", true);
    expect(loginFake).toHaveBeenCalledWith({ login: "morozova", password: "teacher112", armNumber: 21 });
    expect(screen.getByLabelText(/код из сообщения/i)).toBeInTheDocument();
    expect(sessionStore.get()).toBeNull();
  });

  it("клавиша Enter в поле отправляет оба шага: логин и код 2FA", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    fireEvent.change(screen.getByLabelText(/логин/i), { target: { value: "morozova" } });
    fireEvent.change(screen.getByLabelText(/пароль/i), { target: { value: "teacher112" } });
    fireEvent.change(screen.getByLabelText(/номер АРМ/i), { target: { value: "21" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText(/номер АРМ/i), { key: "Enter" });
    });
    const codeField = screen.getByLabelText(/код из сообщения/i);
    fireEvent.change(codeField, { target: { value: "123456" } });
    await act(async () => {
      fireEvent.keyDown(codeField, { key: "Enter" });
    });
    expect(loginFake).toHaveBeenLastCalledWith(expect.objectContaining({ twoFactorCode: "123456" }));
    expect(sessionStore.get()).toMatchObject({ userId: "u-002" });
  });

  it("2FA: 5 цифр — ошибка формата; 6 цифр — сессия (twoFactorUsed) и редирект по роли", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", "21");
    await submitCode("12345");
    expect(screen.getByRole("alert")).toHaveTextContent("6-значный код");
    expect(loginFake).toHaveBeenCalledTimes(1);
    await submitCode("123456");
    expect(loginFake).toHaveBeenLastCalledWith(expect.objectContaining({ twoFactorCode: "123456" }));
    expect(sessionStore.get()).toMatchObject({ userId: "u-002", twoFactorUsed: true });
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("returnUrl гварда: после входа возврат на запрошенный URL", async () => {
    const studentSession: AuthSession = { ...TEACHER_SESSION, userId: "u-005", role: "student" };
    render(
      <AuthForm
        loginRequest={resolvesWith(studentSession)}
        returnUrl="/arm/card/card-881412"
        isTwoFactorEnabled={false}
      />,
    );
    await submitCredentials("ivanov", "student112", "1");
    expect(replaceMock).toHaveBeenCalledWith("/arm/card/card-881412");
  });

  it("2FA выключен флагом — шаг кода не показывается, вход сразу", async () => {
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} isTwoFactorEnabled={false} />);
    await submitCredentials("morozova", "teacher112", "21");
    expect(screen.queryByLabelText(/код из сообщения/i)).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("401 из мок-ответа — «Неверный логин или пароль» под формой, без 2FA и сессии", async () => {
    render(<AuthForm loginRequest={rejectsWith(401, "Неверный логин или пароль")} />);
    await submitCredentials("ivanov", "wrong", "1");
    expect(screen.getByRole("alert")).toHaveTextContent("Неверный логин или пароль");
    expect(screen.queryByLabelText(/код из сообщения/i)).not.toBeInTheDocument();
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
    expect(screen.getByLabelText(/код из сообщения/i)).toBeInTheDocument();
  });
});

describe("настройка администратора «Требовать 2FA» (T4.2-17)", () => {
  const policy = (twoFactorRequired: boolean) =>
    vi.fn(async () => ({ twoFactorRequired, minPasswordLength: 8, lockAfterAttempts: 5 }));

  beforeEach(() => {
    replaceMock.mockClear();
    sessionStore.clear();
  });

  it("2FA включена в настройках — шаг кода запрашивается", async () => {
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} authPolicyRequest={policy(true)} />);
    await act(async () => undefined);
    await submitCredentials("morozova", "teacher112", "21");
    expect(screen.getByLabelText(/код из сообщения/i)).toBeInTheDocument();
  });

  it("администратор выключил 2FA — /login больше не запрашивает код", async () => {
    const authPolicyRequest = policy(false);
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} authPolicyRequest={authPolicyRequest} />);
    await act(async () => undefined);
    expect(authPolicyRequest).toHaveBeenCalled();
    await submitCredentials("morozova", "teacher112", "21");
    expect(screen.queryByLabelText(/код из сообщения/i)).not.toBeInTheDocument();
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("политика недоступна — остаётся безопасное значение «2FA включена»", async () => {
    const failing = vi.fn(async () => {
      throw new ApiError(0, "networkError", "Нет соединения");
    });
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} authPolicyRequest={failing} />);
    await act(async () => undefined);
    await submitCredentials("morozova", "teacher112", "21");
    expect(screen.getByLabelText(/код из сообщения/i)).toBeInTheDocument();
  });
});
