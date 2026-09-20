import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DialPad } from "./DialPad";

function DialPadHarness({ onCall = () => undefined }: { onCall?: () => void }) {
  const [value, setValue] = useState("");
  return <DialPad value={value} onValueChange={setValue} onCall={onCall} />;
}

describe("DialPad", () => {
  it("рендерит поле номера, клавиатуру и «Позвонить»", () => {
    render(<DialPadHarness />);
    expect(screen.getByLabelText("Номер абонента")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Клавиша/ })).toHaveLength(12);
    expect(screen.getByRole("button", { name: /Позвонить/ })).toBeDisabled();
  });

  it("клавиша «3» добавляет символ в поле набора", () => {
    render(<DialPadHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Клавиша 3" }));
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("3");
    fireEvent.click(screen.getByRole("button", { name: "Клавиша 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Клавиша 1" }));
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("301");
  });

  it("2-значный номер не отправляется: «Позвонить» недоступна", () => {
    const handleCall = vi.fn();
    render(<DialPadHarness onCall={handleCall} />);
    fireEvent.click(screen.getByRole("button", { name: "Клавиша 3" }));
    fireEvent.click(screen.getByRole("button", { name: "Клавиша 0" }));
    expect(screen.getByRole("button", { name: /Позвонить/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Позвонить/ }));
    expect(handleCall).not.toHaveBeenCalled();
  });

  it("цифры и Backspace с физической клавиатуры при фокусе на клавишах панели", () => {
    render(<DialPadHarness />);
    const key = screen.getByRole("button", { name: "Клавиша 5" });
    for (const digit of ["3", "0", "2", "9"]) fireEvent.keyDown(key, { key: digit });
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("3029");
    fireEvent.keyDown(key, { key: "Backspace" });
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("302");
    fireEvent.keyDown(key, { key: "a" });
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("302");
  });

  it("сообщение «Абонент не найден» показывается под полем", () => {
    render(
      <DialPad
        value="999"
        onValueChange={() => undefined}
        onCall={() => undefined}
        notice="Абонент не найден"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Абонент не найден");
    expect(screen.getByLabelText("Номер абонента")).toHaveAttribute("aria-invalid", "true");
  });

  it("не даёт набрать больше 4 знаков и вызывает onCall", () => {
    const handleCall = vi.fn();
    render(<DialPadHarness onCall={handleCall} />);
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Клавиша 1" }));
    expect(screen.getByLabelText("Номер абонента")).toHaveValue("1111");
    fireEvent.click(screen.getByRole("button", { name: /Позвонить/ }));
    expect(handleCall).toHaveBeenCalledOnce();
  });
});
