import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { reference } from "@/shared/api";

import { getStatusOptions } from "../model/statusOptions";
import { StatusForm } from "./StatusForm";

const options = getStatusOptions({ ddsStatuses: reference.ddsStatuses, currentStatus: "received" });
const workOptions = getStatusOptions({ ddsStatuses: reference.ddsStatuses, currentStatus: "workInProgress" });

function choose(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "Статус" }));
  fireEvent.click(screen.getByRole("option", { name: title }));
}

describe("StatusForm", () => {
  it("содержит поля «Статус», «Номер наряда», «Комментарий»", () => {
    render(<StatusForm options={options} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Статус" })).toBeInTheDocument();
    expect(screen.getByLabelText("Номер наряда")).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInTheDocument();
  });

  it("недоступные статусы видны неактивными, комментарий к «Не принята» обязателен", () => {
    const handleSubmit = vi.fn();
    render(<StatusForm options={options} onSubmit={handleSubmit} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    expect(screen.getByRole("option", { name: "Прибытие" })).toBeDisabled();
    fireEvent.click(screen.getByRole("option", { name: "Не принята" }));
    expect(screen.getByRole("alert")).toHaveTextContent("комментарий обязателен");
    expect(screen.getByRole("button", { name: "Сохранить статус (Enter)" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "вне компетенции" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    expect(handleSubmit).toHaveBeenCalledWith({
      status: "notAccepted",
      dutyNumber: "",
      comment: "вне компетенции",
    });
  });

  it("фокус при открытии — на «Статус», Tab ходит по кругу внутри формы (T5.2-02)", () => {
    render(<StatusForm options={options} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    const form = screen.getByRole("form", { name: "Смена статуса реагирования" });
    const statusButton = screen.getByRole("button", { name: "Статус" });
    const cancel = screen.getByRole("button", { name: "Отмена (Esc)" });

    expect(document.activeElement).toBe(statusButton);

    cancel.focus();
    fireEvent.keyDown(form, { key: "Tab" });
    expect(document.activeElement).toBe(statusButton);

    fireEvent.keyDown(form, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it("порядок Tab совпадает с порядком полей формы, ✓ и ✕ — кнопки с клавиатуры (T5.2-02)", () => {
    const handleCancel = vi.fn();
    render(<StatusForm options={options} onSubmit={vi.fn()} onCancel={handleCancel} />);
    const form = screen.getByRole("form", { name: "Смена статуса реагирования" });
    const order = Array.from(form.querySelectorAll<HTMLElement>("button, input")).map(
      (node) => node.getAttribute("aria-label") ?? node.textContent,
    );
    expect(order).toEqual([
      "Статус",
      "Номер наряда",
      "Комментарий",
      "Сохранить статус (Enter)",
      "Отмена (Esc)",
    ]);
    // Ловушек нет: положительных tabindex в форме не заводим.
    expect(form.querySelector('[tabindex]:not([tabindex="-1"])')).toBeNull();

    const cancel = screen.getByRole("button", { name: "Отмена (Esc)" });
    expect(cancel.tagName).toBe("BUTTON");
    cancel.focus();
    expect(document.activeElement).toBe(cancel);
    fireEvent.click(cancel);
    expect(handleCancel).toHaveBeenCalled();
  });

  it("Esc закрывает форму", () => {
    const handleCancel = vi.fn();
    render(<StatusForm options={options} onSubmit={vi.fn()} onCancel={handleCancel} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(handleCancel).toHaveBeenCalled();
  });

  it("«Работы завершены»: предупреждение памятки и подтверждение перед сохранением (закрывает карточку)", async () => {
    const handleSubmit = vi.fn(async () => undefined);
    render(<StatusForm options={workOptions} onSubmit={handleSubmit} onCancel={vi.fn()} />);
    choose("Работы завершены");
    expect(screen.getByText(/сохранение статуса закрывает карточку для редактирования/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    expect(handleSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться к форме" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус и закрыть карточку" }));
    await waitFor(() =>
      expect(handleSubmit).toHaveBeenCalledWith({ status: "workDone", dutyNumber: "", comment: "" }),
    );
  });

  it("«Отказ от выполнения работ» без комментария заблокирован; отказ сервера показывается в форме", async () => {
    const handleSubmit = vi.fn(async () => {
      throw new Error("Переход недопустим");
    });
    render(<StatusForm options={workOptions} onSubmit={handleSubmit} onCancel={vi.fn()} />);
    choose("Отказ от выполнения работ");
    expect(screen.getByRole("button", { name: "Сохранить статус (Enter)" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Комментарий"), { target: { value: "Передано в 102" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус (Enter)" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить статус и закрыть карточку" }));
    expect(await screen.findByText("Переход недопустим")).toBeInTheDocument();
  });

  it("после «Не принята» доступна только «Принята»", () => {
    const afterRefusal = getStatusOptions({
      ddsStatuses: reference.ddsStatuses,
      currentStatus: "notAccepted",
    });
    render(<StatusForm options={afterRefusal} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Статус" }));
    const enabled = screen.getAllByRole("option").filter((option) => !option.hasAttribute("disabled"));
    expect(enabled.map((option) => option.textContent)).toEqual(["Принята"]);
  });
});
