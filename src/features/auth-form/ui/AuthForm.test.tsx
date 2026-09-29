import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { LoginRequest, LoginResult } from "@/shared/api";

import { AuthForm } from "./AuthForm";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

/** Результат входа для клиента: только кто вошёл — токен сервер кладёт в HttpOnly-cookie. */
const TEACHER_SESSION: LoginResult = { userId: "u-002", role: "teacher" };

type LoginFake = ReturnType<typeof vi.fn<(request: LoginRequest) => Promise<LoginResult>>>;

function resolvesWith(session: LoginResult): LoginFake {
  return vi.fn(async () => session);
}

function rejectsWith(status: number, message: string): LoginFake {
  return vi.fn(async () => {
    throw new ApiError(
      status,
      status === 403 ? "accountBlocked" : status === 429 ? "internal" : "unauthorized",
      message,
    );
  });
}

async function submitCredentials(login: string, password: string, viaEnter = false) {
  fireEvent.change(screen.getByLabelText("Логин"), { target: { value: login } });
  fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: password } });
  await act(async () => {
    if (viaEnter) fireEvent.submit(screen.getByLabelText("Пароль").closest("form")!);
    else fireEvent.click(screen.getByRole("button", { name: "Войти" }));
  });
}

describe("AuthForm", () => {
  beforeEach(() => {
    replaceMock.mockClear();
  });

  it("содержит поля «Логин», «Пароль» и кнопку «Войти», без номера АРМ", () => {
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} />);
    expect(screen.getByLabelText("Логин")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText(/номер АРМ/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });

  it("submit отправляет только логин и пароль и завершает вход", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112", true);
    expect(loginFake).toHaveBeenCalledWith({ login: "morozova", password: "teacher112" });
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("клавиша Enter в поле отправляет форму", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "morozova" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "teacher112" } });
    await act(async () => {
      fireEvent.keyDown(screen.getByLabelText("Пароль"), { key: "Enter" });
    });
    expect(loginFake).toHaveBeenCalledWith({ login: "morozova", password: "teacher112" });
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("один запрос входа и один редирект; токен на клиенте не сохраняется", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "teacher112");
    expect(loginFake).toHaveBeenCalledTimes(1);
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(document.cookie).not.toContain("arm112_session");
    expect(window.localStorage.length + window.sessionStorage.length).toBe(0);
  });

  it("returnUrl гварда: после входа возврат на запрошенный URL", async () => {
    const studentSession: LoginResult = { userId: "u-005", role: "student" };
    render(<AuthForm loginRequest={resolvesWith(studentSession)} returnUrl="/arm/card/card-881412" />);
    await submitCredentials("ivanov", "student112");
    expect(replaceMock).toHaveBeenCalledWith("/arm/card/card-881412");
  });

  it.each(["https://evil.example/", "//evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "open redirect: returnUrl «%s» игнорируется, вход ведёт в раздел роли",
    async (returnUrl) => {
      render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} returnUrl={returnUrl} />);
      await submitCredentials("morozova", "teacher112");
      expect(replaceMock).toHaveBeenCalledWith("/teacher");
    },
  );

  it("returnUrl чужого раздела: роль не имеет доступа — вход ведёт в свой раздел", async () => {
    render(<AuthForm loginRequest={resolvesWith(TEACHER_SESSION)} returnUrl="/admin/system" />);
    await submitCredentials("morozova", "teacher112");
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });

  it("401 — «Неверный логин или пароль» под формой, без сессии", async () => {
    render(<AuthForm loginRequest={rejectsWith(401, "Неверный логин или пароль")} />);
    await submitCredentials("ivanov", "wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("Неверный логин или пароль");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("403 — сообщение блокировки, не «неверный логин»; перехода нет", async () => {
    render(<AuthForm loginRequest={rejectsWith(403, "blocked")} />);
    await submitCredentials("egorov", "student112");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Учётная запись заблокирована. Обратитесь к администратору",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Неверный логин");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("429 — лимит попыток входа", async () => {
    render(<AuthForm loginRequest={rejectsWith(429, "Слишком много попыток входа. Повторите позже")} />);
    await submitCredentials("ivanov", "wrong");
    expect(screen.getByRole("alert")).toHaveTextContent("Слишком много попыток входа. Повторите позже");
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("пустой логин или пароль — подсказка без запроса к серверу", async () => {
    const loginFake = resolvesWith(TEACHER_SESSION);
    render(<AuthForm loginRequest={loginFake} />);
    await submitCredentials("morozova", "");
    expect(screen.getByRole("alert")).toHaveTextContent("Введите логин и пароль");
    expect(loginFake).not.toHaveBeenCalled();
  });

  it("pending: кнопка неактивна, пока идёт запрос", async () => {
    let resolveLogin: (session: LoginResult) => void = () => undefined;
    const pendingLogin = vi.fn(() => new Promise<LoginResult>((resolve) => (resolveLogin = resolve)));
    render(<AuthForm loginRequest={pendingLogin} />);
    await submitCredentials("morozova", "teacher112");
    expect(screen.getByRole("button", { name: "Войти" })).toBeDisabled();
    await act(async () => resolveLogin(TEACHER_SESSION));
    expect(replaceMock).toHaveBeenCalledWith("/teacher");
  });
});
