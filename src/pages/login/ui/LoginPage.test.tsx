import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as SharedApi from "@/shared/api";
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
}));

const DEFAULT_PROPS = {
  isDemoMode: true,
  isTwoFactorEnabled: true,
  returnUrl: null,
  isSessionExpired: false,
  demoRole: "student",
} as const;

describe("LoginScreen (/login)", () => {
  it("рендерит «112 ВХОД В СИСТЕМУ», пометку учебной системы и блок поддержки", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("112ВХОД В СИСТЕМУ");
    expect(screen.getByText("Учебный тренажёр оператора ДДС — эмулятор АРМ-112")).toBeInTheDocument();
    expect(screen.getByText("Техническая поддержка учебного комплекса")).toBeInTheDocument();
  });

  it("пометка «Учебная система…» видна при любом демо-флаге", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isDemoMode={false} />);
    expect(screen.getByText("Учебная система. Не является рабочей системой-112")).toBeInTheDocument();
  });

  it("содержит поля «Логин», «Пароль», «Номер АРМ»", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    expect(screen.getByLabelText(/логин/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/пароль/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/номер АРМ/i)).toBeInTheDocument();
  });

  it("демо on: подсказки учёток (из mocks/users.json) и ссылки «Войти как …» предзаполняют форму", () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    const summary = screen.getByText("Тестовые учётные записи (демо-режим):");
    expect(summary.closest("details")).not.toHaveAttribute("open");
    fireEvent.click(summary);
    expect(screen.getByText("ivanov")).toBeInTheDocument();
    expect(screen.getByText("egorov")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "преподаватель" })).toHaveAttribute(
      "href",
      "/login?demo=teacher",
    );
    expect(screen.getByLabelText(/логин/i)).toHaveValue("ivanov");
  });

  it("демо: ?demo=admin предзаполняет учётку администратора, returnUrl сохраняется в ссылках", () => {
    render(<LoginScreen {...DEFAULT_PROPS} demoRole="admin" returnUrl="/admin/system" />);
    fireEvent.click(screen.getByText("Тестовые учётные записи (демо-режим):"));
    expect(screen.getByLabelText(/логин/i)).toHaveValue("admin");
    expect(screen.getByRole("link", { name: "обучающийся" })).toHaveAttribute(
      "href",
      "/login?returnUrl=%2Fadmin%2Fsystem&demo=student",
    );
  });

  it("демо off: подсказки учёток скрыты, форма пустая", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isDemoMode={false} />);
    expect(screen.queryByText("Тестовые учётные записи (демо-режим):")).not.toBeInTheDocument();
    expect(screen.queryByText("ivanov")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/логин/i)).toHaveValue("");
  });

  it("истёкшая сессия: сообщение «Сессия истекла»", () => {
    render(<LoginScreen {...DEFAULT_PROPS} isSessionExpired />);
    expect(screen.getByRole("status")).toHaveTextContent("Сессия истекла");
  });

  it("демо: «ВОЙТИ» с предзаполненной учёткой (ответ мок-клиента 200) открывает шаг 2FA", async () => {
    render(<LoginScreen {...DEFAULT_PROPS} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "ВОЙТИ" }));
    });
    expect(screen.getByLabelText(/код из сообщения/i)).toBeInTheDocument();
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
