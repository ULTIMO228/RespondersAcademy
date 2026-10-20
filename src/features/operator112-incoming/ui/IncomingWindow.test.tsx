import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { IncomingWindow } from "./IncomingWindow";

describe("IncomingWindow: окно входящего (ИНСТРУКЦИЯ_4, ИНСТРУКЦИЯ_107)", () => {
  it("звонок: номер в формате АРМ, «Принять» принимает, «×» прячет без приёма", () => {
    const onAccept = vi.fn();
    const onHide = vi.fn();
    render(<IncomingWindow aon="4995503456" onAccept={onAccept} onHide={onHide} />);
    expect(screen.getByRole("dialog", { name: "Входящий звонок" })).toBeInTheDocument();
    expect(screen.getByText("с номера +7 (499) 550-34-56")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Принять" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть окно вызова" }));
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("СМС: «Входящее сообщение», источник и номер без «+7» и разделителей", () => {
    render(<IncomingWindow channel="sms" aon="4955551122" onAccept={vi.fn()} onHide={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Входящее сообщение" })).toBeInTheDocument();
    expect(screen.getByText("Источник - СМС")).toBeInTheDocument();
    expect(screen.getByText("карточка 4955551122")).toBeInTheDocument();
  });

  it("Enter в окне = «Принять»; во время соединения «Принять» заблокирована", () => {
    const onAccept = vi.fn();
    const { rerender } = render(<IncomingWindow aon="4995503456" onAccept={onAccept} onHide={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onAccept).toHaveBeenCalledTimes(1);
    rerender(<IncomingWindow aon="4995503456" isAnswering onAccept={onAccept} onHide={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Соединение…" })).toBeDisabled();
  });
});
