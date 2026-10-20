import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FlowLibrary } from "./FlowLibrary";

describe("FlowLibrary", () => {
  it("показывает группы блоков; «Начало и конец» свёрнута, щелчок добавляет блок", () => {
    const onAdd = vi.fn();
    render(<FlowLibrary mode="operator112" onAdd={onAdd} />);
    expect(screen.getByRole("button", { name: /Вызов и заявитель/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("button", { name: /Начало и конец/ })).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /^Условие/ }));
    expect(onAdd).toHaveBeenCalledWith({ type: "condition" });
  });

  it("поиск «газ» находит и блок, и готовое действие режима 112", () => {
    const onAdd = vi.fn();
    render(<FlowLibrary mode="operator112" onAdd={onAdd} />);
    fireEvent.change(screen.getByPlaceholderText("Найти блок или действие"), { target: { value: "газ" } });
    const found = screen.getByRole("list", { name: "Найдено" });
    expect(within(found).getByRole("button", { name: /^Действие/ })).toBeInTheDocument();
    fireEvent.click(within(found).getByRole("button", { name: /Оповестить службу 104/ }));
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "action",
        props: expect.objectContaining({ what: "notifyService", service: "svc-104" }),
      }),
    );
  });

  it("готовые действия зависят от режима; пустой поиск даёт подсказку", () => {
    render(<FlowLibrary mode="dds" onAdd={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Готовые действия/ }));
    expect(screen.getByRole("button", { name: /Поставить статус «Принята»/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Оповестить службу 104/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Найти блок или действие"), { target: { value: "абвгд" } });
    expect(screen.getByRole("status")).toHaveTextContent("Ничего не найдено");
  });

  it("в пробном прогоне библиотека недоступна", () => {
    render(<FlowLibrary mode="dds" onAdd={vi.fn()} disabled />);
    expect(screen.getByRole("button", { name: /^Условие/ })).toBeDisabled();
  });
});
