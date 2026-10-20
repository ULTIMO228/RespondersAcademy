import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IncomingCallWindow } from "./IncomingCallWindow";

describe("IncomingCallWindow: окно «Входящий звонок» (ИНСТРУКЦИЯ_4)", () => {
  it("номер в формате АРМ, «Принять» принимает вызов, «×» закрывает окно без приёма", () => {
    const onAnswer = vi.fn();
    const onClose = vi.fn();
    render(<IncomingCallWindow aon="9161263471" onAnswer={onAnswer} onClose={onClose} />);
    expect(screen.getByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
    expect(screen.getByText("с номера +7 (916) 126-34-71")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть окно вызова" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).toHaveBeenCalledTimes(1);
  });

  it("во время запроса «Принять» блокируется от повторного нажатия", () => {
    render(<IncomingCallWindow aon="9161263471" isAnswering onAnswer={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Соединение…" })).toBeDisabled();
  });
});
