import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotificationListItem } from "@/shared/api";

import { ServicesPanel } from "./ServicesPanel";

const item = (
  serviceId: string,
  title: string,
  addedBy: "auto" | "manual" = "auto",
): NotificationListItem => ({
  serviceId,
  title,
  addedBy,
});

const SERVICES = [item("svc-101", "Служба 101 (МЧС)"), item("svc-112", "ЦОДД", "manual")];
const CONDITIONAL = [item("svc-103", "СМП (Служба 103)")];

function setup(props: Partial<React.ComponentProps<typeof ServicesPanel>> = {}) {
  const handlers = {
    onRemove: vi.fn(),
    onAddServices: vi.fn(),
    onSave: vi.fn(),
    onLinks: vi.fn(),
    onReminder: vi.fn(),
    onProblem: vi.fn(),
    onClose: vi.fn(),
  };
  render(<ServicesPanel services={SERVICES} conditional={CONDITIONAL} {...handlers} {...props} />);
  return handlers;
}

describe("ServicesPanel", () => {
  it("«Службы:», плитки с названием, первая подчёркнута, справа «+», «сохранить» и значки", () => {
    setup();
    expect(screen.getByText("Службы:")).toBeInTheDocument();
    const tiles = within(screen.getByRole("list", { name: "Список оповещения" })).getAllByRole("listitem");
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toHaveAttribute("data-first", "true");
    expect(tiles[1]).toHaveAttribute("data-first", "false");
    expect(within(tiles[0]).getByText("Служба 101")).toBeInTheDocument();
    for (const name of [
      "Развернуть список служб",
      "Добавить службы",
      "сохранить",
      "Связи",
      "Напоминание",
      "Внимание",
      "Оповещение",
      "Сообщить о проблеме",
      "Закрыть карточку",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("автоматическая служба не удаляется, ручная — «×» с обратным вызовом", () => {
    const h = setup();
    const auto = screen.getByRole("button", { name: "Удалить службу Служба 101 (МЧС)" });
    expect(auto).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(auto);
    expect(h.onRemove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Удалить службу ЦОДД" }));
    expect(h.onRemove).toHaveBeenCalledWith("svc-112");
  });

  it("«рука» и колокол — aria-disabled; связи, напоминание, сообщение, закрыть, «сохранить» вызывают обработчики", () => {
    const h = setup();
    expect(screen.getByRole("button", { name: "Внимание" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Оповещение" })).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Связи" }));
    fireEvent.click(screen.getByRole("button", { name: "Напоминание" }));
    fireEvent.click(screen.getByRole("button", { name: "Сообщить о проблеме" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть карточку" }));
    fireEvent.click(screen.getByRole("button", { name: "сохранить" }));
    expect(h.onLinks).toHaveBeenCalledOnce();
    expect(h.onReminder).toHaveBeenCalledOnce();
    expect(h.onProblem).toHaveBeenCalledOnce();
    expect(h.onClose).toHaveBeenCalledOnce();
    expect(h.onSave).toHaveBeenCalledOnce();
  });

  it("значок без обработчика неактивен", () => {
    setup({ onLinks: undefined });
    expect(screen.getByRole("button", { name: "Связи" })).toHaveAttribute("aria-disabled", "true");
  });

  it("«⇕» разворачивает панель", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Развернуть список служб" }));
    expect(screen.getByRole("contentinfo", { name: "Службы" })).toHaveAttribute("data-expanded", "true");
  });

  it("«+» → окно; «Сохранить и закрыть» передаёт выбранные службы, «×» — без изменений", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "Добавить службы" }));
    fireEvent.click(screen.getByRole("button", { name: "СМП (Служба 103)" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и закрыть" }));
    expect(h.onAddServices).toHaveBeenCalledWith(["svc-103"]);
    fireEvent.click(screen.getByRole("button", { name: "Добавить службы" }));
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(h.onAddServices).toHaveBeenCalledOnce();
  });

  it("сохранённая карточка: серая панель, строка статуса, без «+», «сохранить» и «×»", () => {
    setup({ saved: true, statusLines: { "svc-101": "13:15 Принята" } });
    expect(screen.getByRole("contentinfo", { name: "Службы" })).toHaveAttribute("data-saved", "true");
    expect(screen.getByText("13:15 Принята")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить службы" })).toBeNull();
    expect(screen.queryByRole("button", { name: "сохранить" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Удалить службу/ })).toBeNull();
  });

  it("загрузка и ошибка расчёта показываются, «Повторить» работает", () => {
    const onRetry = vi.fn();
    setup({ services: [], status: "error", errorMessage: "Сбой сервера", onRetry });
    expect(screen.getByRole("alert")).toHaveTextContent("Сбой сервера");
    fireEvent.click(screen.getByRole("button", { name: "Повторить" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
