import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ApplicantRow112 } from "./ApplicantRow112";

describe("ApplicantRow112", () => {
  it("поля, два выпадающих и кнопка перевода; ввод и выбор статуса уходят в колбэки", () => {
    const onName = vi.fn();
    const onStatus = vi.fn();
    const onTranslate = vi.fn();
    render(
      <ApplicantRow112 name="" status="" onName={onName} onStatus={onStatus} onTranslate={onTranslate} />,
    );
    expect(screen.getByRole("option", { name: "выберите статус" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Фамилия и имя заявителя"), { target: { value: "Иванов Пётр" } });
    expect(onName).toHaveBeenCalledWith("Иванов Пётр");
    fireEvent.change(screen.getByLabelText("Статус заявителя"), { target: { value: "очевидец" } });
    expect(onStatus).toHaveBeenCalledWith("очевидец");
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Перевод" }));
    expect(onTranslate).toHaveBeenCalledTimes(1);
  });

  it("значение вне списка не теряется", () => {
    render(<ApplicantRow112 name="" status="сосед" onName={vi.fn()} onStatus={vi.fn()} />);
    expect(screen.getByLabelText("Статус заявителя")).toHaveValue("сосед");
  });
});
