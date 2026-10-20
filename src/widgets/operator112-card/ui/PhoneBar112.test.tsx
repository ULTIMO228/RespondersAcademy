import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PhoneBar112 } from "./PhoneBar112";

describe("PhoneBar112", () => {
  it("«АОН» подставляет номер заявителя; счётчик на «список SMS»", () => {
    const onProvided = vi.fn();
    render(
      <PhoneBar112
        status="доступен"
        aon="+7 (916) 126-34-71"
        phoneProvided=""
        phoneOnSite=""
        onPhoneProvided={onProvided}
        onPhoneOnSite={vi.fn()}
        smsUnread={3}
        onSmsList={vi.fn()}
      />,
    );
    expect(screen.getByText("доступен")).toBeInTheDocument();
    expect(screen.getByLabelText("непрочитанных: 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "предоставленный: подставить АОН" }));
    expect(onProvided).toHaveBeenCalledWith("+7 (916) 126-34-71");
  });

  it("трубка активна только при входящем", () => {
    const onHandset = vi.fn();
    const { rerender } = render(
      <PhoneBar112
        status="Отключение"
        aon=""
        phoneProvided=""
        phoneOnSite=""
        onPhoneProvided={vi.fn()}
        onPhoneOnSite={vi.fn()}
        onHandset={onHandset}
      />,
    );
    expect(screen.getByRole("button", { name: "Отключение" })).toBeDisabled();
    rerender(
      <PhoneBar112
        status="доступен"
        isHandsetActive
        aon=""
        phoneProvided=""
        phoneOnSite=""
        onPhoneProvided={vi.fn()}
        onPhoneOnSite={vi.fn()}
        onHandset={onHandset}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Входящий звонок" }));
    expect(onHandset).toHaveBeenCalledTimes(1);
  });
});
