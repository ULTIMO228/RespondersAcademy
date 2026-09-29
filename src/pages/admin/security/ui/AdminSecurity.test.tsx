import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { SystemSettings } from "@/shared/api";

import type { AdminSecurityApi } from "../api/securityApi";
import { AdminSecurityScreen, validateSecurity } from "./AdminSecurityScreen";

const settings = (minPasswordLength = 8, lockAfterAttempts = 5) =>
  ({ security: { minPasswordLength, lockAfterAttempts } }) as SystemSettings;

const makeApi = (overrides: Partial<AdminSecurityApi> = {}): AdminSecurityApi => ({
  getSettings: vi.fn().mockResolvedValue(settings()),
  patchSettings: vi.fn().mockResolvedValue(settings(10, 3)),
  ...overrides,
});

describe("validateSecurity", () => {
  it("границы длины пароля 6–64 и попыток 1–10; нечисловой ввод — ошибка", () => {
    expect(validateSecurity("8", "5")).toEqual([]);
    expect(validateSecurity("5", "5").map((item) => item.field)).toEqual(["security.minPasswordLength"]);
    expect(validateSecurity("65", "5")).toHaveLength(1);
    expect(validateSecurity("8", "0").map((item) => item.field)).toEqual(["security.lockAfterAttempts"]);
    expect(validateSecurity("8", "11")).toHaveLength(1);
    expect(validateSecurity("abc", "")).toHaveLength(2);
  });
});

describe("страница «Безопасность»", () => {
  it("не показывает 2FA и срок сессии", async () => {
    render(<AdminSecurityScreen api={makeApi()} />);
    await screen.findByLabelText("Минимальная длина пароля");
    expect(screen.queryByText(/2FA|двухфактор/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/срок сессии/i)).not.toBeInTheDocument();
  });

  it("сохранение — только после подтверждения; уходит только блок security", async () => {
    const api = makeApi();
    render(<AdminSecurityScreen api={api} />);
    fireEvent.change(await screen.findByLabelText("Минимальная длина пароля"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/Блокировка после/), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(api.patchSettings).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    await waitFor(() =>
      expect(api.patchSettings).toHaveBeenCalledWith({
        security: { minPasswordLength: 10, lockAfterAttempts: 3 },
      }),
    );
    expect(await screen.findByText("Политика сохранена и записана в журнал аудита.")).toBeInTheDocument();
  });

  it("значение вне диапазона блокирует сохранение и подсвечивает поле", async () => {
    render(<AdminSecurityScreen api={makeApi()} />);
    fireEvent.change(await screen.findByLabelText("Минимальная длина пароля"), { target: { value: "3" } });
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("отказ сервера (400/403) показывается дословно, введённое остаётся", async () => {
    const api = makeApi({
      patchSettings: vi
        .fn()
        .mockRejectedValue(
          new ApiError(400, "validationFailed", "2FA не поддерживается в локальном контуре"),
        ),
    });
    render(<AdminSecurityScreen api={api} />);
    fireEvent.change(await screen.findByLabelText("Минимальная длина пароля"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить" }));
    expect(await screen.findByText("2FA не поддерживается в локальном контуре")).toBeInTheDocument();
    expect(screen.getByLabelText("Минимальная длина пароля")).toHaveValue("12");
  });
});
