import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { NotificationListItem } from "@/shared/api";

import { AddServicesWindow } from "./AddServicesWindow";

const item = (serviceId: string, title: string): NotificationListItem => ({
  serviceId,
  title,
  addedBy: "auto",
});

function setup() {
  const onSave = vi.fn();
  const onClose = vi.fn();
  render(
    <AddServicesWindow
      services={[item("svc-101", "Служба 101 (МЧС)")]}
      conditional={[item("svc-103", "СМП (Служба 103)"), item("svc-104", "Газовая служба (104)")]}
      onSave={onSave}
      onClose={onClose}
    />,
  );
  return { onSave, onClose };
}

describe("AddServicesWindow «Добавьте службы»", () => {
  it("заголовок, «×», «Поиск …», «Сохранить и закрыть»; выбранные подсвечены", () => {
    setup();
    expect(screen.getByRole("dialog", { name: "Добавьте службы" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Поиск ...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Закрыть (Esc)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Служба 101 (МЧС)" })).toHaveAttribute("data-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: "СМП (Служба 103)" }));
    expect(screen.getByRole("button", { name: "СМП (Служба 103)" })).toHaveAttribute("data-selected", "true");
  });

  it("поиск фильтрует по подстроке без учёта регистра", () => {
    setup();
    fireEvent.change(screen.getByLabelText("Поиск службы"), { target: { value: "ГАЗ" } });
    expect(screen.getByRole("button", { name: "Газовая служба (104)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "СМП (Служба 103)" })).toBeNull();
  });

  it("«Сохранить и закрыть» отдаёт только вновь отмеченные; «×» закрывает без сохранения", () => {
    const { onSave, onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "СМП (Служба 103)" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и закрыть" }));
    expect(onSave).toHaveBeenCalledWith(["svc-103"]);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть (Esc)" }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledOnce();
  });
});
