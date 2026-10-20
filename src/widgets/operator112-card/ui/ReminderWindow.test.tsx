import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ReminderWindow } from "./ReminderWindow";

function setup() {
  const handlers = { onGoToCard: vi.fn(), onSnooze: vi.fn(), onDelete: vi.fn(), onClose: vi.fn() };
  render(
    <ReminderWindow
      cardNumber={132996}
      dateTime="19:01 25.09.2018,"
      address="Москва, Гоголевский бульвар"
      note="Необходимо перезвонить заявителю"
      {...handlers}
    />,
  );
  return handlers;
}

describe("ReminderWindow (ИНСТРУКЦИЯ_100)", () => {
  it("содержимое окна", () => {
    setup();
    expect(screen.getByRole("dialog", { name: /Напоминание для карточки: 132996/ })).toBeInTheDocument();
    expect(screen.getByText("Москва, Гоголевский бульвар")).toBeInTheDocument();
    expect(screen.getByText(/Необходимо перезвонить заявителю/)).toBeInTheDocument();
  });

  it("все действия работают; «напомнить позже» берёт минуты, по умолчанию 5", () => {
    const h = setup();
    fireEvent.click(screen.getByRole("button", { name: "перейти в карточку" }));
    expect(h.onGoToCard).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "напомнить позже" }));
    expect(h.onSnooze).toHaveBeenLastCalledWith(5);
    fireEvent.change(screen.getByLabelText("Минуты"), { target: { value: "1a0" } });
    fireEvent.click(screen.getByRole("button", { name: "напомнить позже" }));
    expect(h.onSnooze).toHaveBeenLastCalledWith(10);
    fireEvent.click(screen.getByRole("button", { name: "удалить напоминание" }));
    expect(h.onDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Закрыть" }));
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
