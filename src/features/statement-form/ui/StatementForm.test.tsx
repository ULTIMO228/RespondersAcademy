import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StatementForm } from "./StatementForm";

describe("StatementForm", () => {
  it("рендерит поле и счётчик символов", () => {
    render(<StatementForm label="Действие диспетчера" />);
    const field = screen.getByLabelText("Действие диспетчера");
    expect(screen.getByText("0 / 1999")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "Принято" } });
    expect(screen.getByText("7 / 1999")).toBeInTheDocument();
  });

  it("read-only блокирует ввод", () => {
    render(<StatementForm label="Действие диспетчера" readOnly />);
    expect(screen.getByLabelText("Действие диспетчера")).toBeDisabled();
  });

  it("управляемый режим: значение, обработчик, блокировка и строка состояния", () => {
    const handleChange = vi.fn();
    render(
      <StatementForm
        label="Действие диспетчера"
        value="Принято"
        onChange={handleChange}
        status="Черновик сохранён"
      />,
    );
    fireEvent.change(screen.getByLabelText("Действие диспетчера"), { target: { value: "Принято." } });
    expect(handleChange).toHaveBeenCalledWith("Принято.");
    expect(screen.getByRole("status")).toHaveTextContent("Черновик сохранён");
  });
});
