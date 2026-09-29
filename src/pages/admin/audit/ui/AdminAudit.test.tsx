import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "@/shared/api";
import type { AuditLogEntry } from "@/shared/api";

import type { AdminAuditApi } from "../api/auditApi";
import { AdminAuditScreen, toQuery } from "./AdminAuditScreen";

const entry = (id: string, action: string): AuditLogEntry => ({
  id,
  at: "2026-09-29T10:00:00+03:00",
  userId: "u-5",
  role: "student",
  action,
  details: `детали ${id}`,
  operatorArm: 4,
});

function makeApi(overrides: Partial<AdminAuditApi> = {}): AdminAuditApi {
  return {
    getAudit: vi.fn().mockResolvedValue({
      items: [
        entry("a1", "auth.logout"),
        entry("a2", "auth.passwordChange"),
        entry("a3", "assignment.finish"),
        entry("a4", "kb.update"),
      ],
      total: 4,
      page: 1,
      perPage: 20,
    }),
    listUsers: vi.fn().mockResolvedValue([{ id: "u-5", fullName: "Иванов Иван" }]),
    ...overrides,
  };
}

describe("toQuery", () => {
  it("передаёт только заполненные фильтры — те, что поддерживает GET /admin/audit", () => {
    expect(toQuery({ type: "", operator: " ", card: "", q: "", from: "", to: "" }, 2)).toEqual({
      page: 2,
      perPage: 20,
    });
    expect(
      toQuery(
        { type: "login", operator: "Иван", card: "c-1", q: "вход", from: "2026-09-01", to: "2026-09-30" },
        1,
      ),
    ).toEqual({
      page: 1,
      perPage: 20,
      type: "login",
      operator: "Иван",
      card: "c-1",
      q: "вход",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
});

describe("страница «Аудит»", () => {
  it("показывает выход, смену пароля, назначения и правку справочника с человекочитаемыми названиями", async () => {
    render(<AdminAuditScreen api={makeApi()} />);
    const table = await screen.findByRole("table", { name: "Журнал аудита" });
    for (const title of [
      "Выход из системы",
      "Смена пароля",
      "Задание завершено",
      "Правка статьи справочника",
    ]) {
      expect(table).toHaveTextContent(title);
    }
    expect(table).toHaveTextContent("Иванов Иван");
    expect(table).toHaveTextContent("Обучающийся");
  });

  it("фильтр отправляет type/operator и возвращается на первую страницу; «Сбросить» очищает", async () => {
    const api = makeApi();
    render(<AdminAuditScreen api={api} />);
    await screen.findByRole("table", { name: "Журнал аудита" });
    fireEvent.change(screen.getByLabelText("Тип события"), { target: { value: "login" } });
    fireEvent.change(screen.getByLabelText("Оператор"), { target: { value: "Иванов" } });
    fireEvent.click(screen.getByRole("button", { name: "Найти" }));
    await waitFor(() =>
      expect(api.getAudit).toHaveBeenLastCalledWith(
        { page: 1, perPage: 20, type: "login", operator: "Иванов" },
        expect.anything(),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Сбросить" }));
    await waitFor(() =>
      expect(api.getAudit).toHaveBeenLastCalledWith({ page: 1, perPage: 20 }, expect.anything()),
    );
  });

  it("пусто и 403 (не администратор) — отдельные состояния", async () => {
    const { unmount } = render(
      <AdminAuditScreen
        api={makeApi({ getAudit: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, perPage: 20 }) })}
      />,
    );
    expect(await screen.findByText("Событий по этим условиям нет.")).toBeInTheDocument();
    unmount();
    render(
      <AdminAuditScreen
        api={makeApi({
          getAudit: vi
            .fn()
            .mockRejectedValue(new ApiError(403, "forbidden", "Раздел доступен администратору")),
        })}
      />,
    );
    expect(await screen.findByText("Раздел доступен администратору")).toBeInTheDocument();
  });
});
