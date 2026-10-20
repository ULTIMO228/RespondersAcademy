import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as SharedApi from "@/shared/api";
import { login, putAiSettings } from "@/shared/api";
import type { AuthSession } from "@/shared/api";

import { readLoginParams } from "../model/loginParams";
import { LoginScreen } from "./LoginPage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

const STUDENT_SESSION: AuthSession = {
  userId: "u-005",
  role: "student",
  token: "mock-u-005-1",
  twoFactorUsed: false,
  issuedAt: "2026-09-17T11:13:19+03:00",
};

vi.mock("@/shared/api", async (importOriginal) => ({
  ...(await importOriginal<typeof SharedApi>()),
  login: vi.fn(async () => STUDENT_SESSION),
  putAiSettings: vi.fn(async () => ({})),
}));

const DEFAULT_PROPS = {
  isDemoMode: true,
  returnUrl: null,
  isSessionExpired: false,
  demoRole: "student",
} as const;

describe("LoginScreen (/login)", () => {
  it("рендерит название тренажёра, нормативы и блок поддержки", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Учебный тренажёр оператора ДДС");
    expect(screen.getByText("30 с")).toBeInTheDocument();
    expect(screen.getByText("3 мин")).toBeInTheDocument();
    expect(screen.getByText(/Техническая поддержка учебного комплекса/)).toBeInTheDocument();
  });

  it("пометка «Учебная система…» видна при любом демо-флаге", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isDemoMode={false} />);
    expect(screen.getByText("Учебная система. Не является рабочей системой-112")).toBeInTheDocument();
  });

  it("содержит поля «Логин» и «Пароль»; номера АРМ и шага 2FA нет (A14)", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    expect(screen.getByLabelText("Логин")).toBeInTheDocument();
    expect(screen.getByLabelText("Пароль")).toHaveAttribute("type", "password");
    expect(screen.queryByLabelText(/номер АРМ/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/код из сообщения/i)).not.toBeInTheDocument();
  });

  it("демо on: подсказки учёток скрыты под «Демо-доступ», ссылки «Войти как …» предзаполняют форму", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    const summary = screen.getByText("Демо-доступ");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(screen.getByText("ivanov")).toBeInTheDocument();
    expect(screen.getByText("lebedev")).toBeInTheDocument();
    // Спека 011 / 021: у обучающегося с одной специализацией подпись — она, оператор ДДС — отдельной строкой.
    expect(screen.getByText("egorov").closest("li")).toHaveTextContent("Оператор ДДС: egorov / student112");
    expect(screen.getByText("ivanov").closest("li")).toHaveTextContent("Специалист 112: ivanov");
    expect(screen.getByRole("link", { name: "преподаватель" })).toHaveAttribute(
      "href",
      "/login?demo=teacher",
    );
    expect(screen.getByLabelText("Логин")).toHaveValue("ivanov");
  });

  it("демо: ?demo=admin предзаполняет учётку администратора, returnUrl сохраняется в ссылках", () => {
    render(<LoginScreen {...DEFAULT_PROPS} demoRole="admin" returnUrl="/admin/system" />);
    fireEvent.click(screen.getByText("Демо-доступ"));
    expect(screen.getByLabelText("Логин")).toHaveValue("admin");
    expect(screen.getByRole("link", { name: "обучающийся" })).toHaveAttribute(
      "href",
      "/login?returnUrl=%2Fadmin%2Fsystem&demo=student",
    );
  });

  it("демо off: подсказки учёток скрыты, форма пустая", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isDemoMode={false} />);
    expect(screen.queryByText("Демо-доступ")).not.toBeInTheDocument();
    expect(screen.queryByText("ivanov")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Логин")).toHaveValue("");
  });

  it("истёкшая сессия: сообщение «Сессия истекла»", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isSessionExpired />);
    expect(screen.getByRole("status")).toHaveTextContent("Сессия истекла");
  });

  it("демо: «Войти» с предзаполненной учёткой завершает вход одним шагом", async () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Войти" }));
    });
    expect(screen.queryByLabelText(/код из сообщения/i)).not.toBeInTheDocument();
  });
});

describe("Ключ Polza.ai на входе", () => {
  const ADMIN_SESSION: AuthSession = { ...STUDENT_SESSION, userId: "u-001", role: "admin" };

  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
  });

  function typeKey() {
    fireEvent.click(screen.getByText("Демо-доступ"));
    fireEvent.change(screen.getByLabelText("Ключ Polza.ai"), { target: { value: "test-key" } });
  }

  async function submit() {
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Войти" }));
      await vi.advanceTimersByTimeAsync(2000);
    });
    vi.useRealTimers();
  }

  it("поле видно в демо-режиме и скрыто без него", () => {
    const { unmount } = render(<LoginScreen {...DEFAULT_PROPS} />);
    expect(screen.getByLabelText("Ключ Polza.ai")).toHaveAttribute("type", "password");
    expect(screen.getByLabelText("Ключ Polza.ai")).toHaveAttribute("autocomplete", "off");
    unmount();
    render(<LoginScreen {...DEFAULT_PROPS} isDemoMode={false} />);
    expect(screen.queryByLabelText("Ключ Polza.ai")).not.toBeInTheDocument();
  });

  it("до входа ключ не отправляется, лежит только в sessionStorage", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    typeKey();
    expect(putAiSettings).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem("arm112_polza_key")).toBe("test-key");
  });

  it("вход admin: ключ уходит в настройки ИИ, storage очищен, показано «Ключ сохранён»", async () => {
    vi.mocked(login).mockResolvedValueOnce(ADMIN_SESSION);
    render(<LoginScreen {...DEFAULT_PROPS} demoRole="admin" />);
    typeKey();
    await submit();
    expect(putAiSettings).toHaveBeenCalledWith({ source: "cloud", apiKey: "test-key" });
    expect(window.sessionStorage.getItem("arm112_polza_key")).toBeNull();
    expect(screen.getByText("Ключ сохранён")).toBeInTheDocument();
  });

  it("вход student: ключ не отправляется, подсказка про admin", async () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    typeKey();
    await submit();
    expect(putAiSettings).not.toHaveBeenCalled();
    expect(screen.getByText("Ключ сохраняет администратор (admin)")).toBeInTheDocument();
  });

  it("ошибка сохранения показывается", async () => {
    vi.mocked(login).mockResolvedValueOnce(ADMIN_SESSION);
    vi.mocked(putAiSettings).mockRejectedValueOnce(new Error("fail"));
    render(<LoginScreen {...DEFAULT_PROPS} demoRole="admin" />);
    typeKey();
    await submit();
    expect(screen.getByText(/Не удалось сохранить ключ/)).toBeInTheDocument();
  });
});

describe("readLoginParams", () => {
  it("returnUrl, reason=expired и demo-роль из query", () => {
    expect(
      readLoginParams({ returnUrl: "/arm/card/card-881412", reason: "expired", demo: "teacher" }),
    ).toEqual({
      returnUrl: "/arm/card/card-881412",
      isSessionExpired: true,
      demoRole: "teacher",
    });
  });

  it("по умолчанию: без returnUrl, не истекла, демо — обучающийся; мусорная роль игнорируется", () => {
    expect(readLoginParams({ demo: ["root", "admin"] })).toEqual({
      returnUrl: null,
      isSessionExpired: false,
      demoRole: "student",
    });
  });
});
