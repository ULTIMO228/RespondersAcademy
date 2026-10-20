import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LockedWindow } from "./LockedWindow";

describe("LockedWindow", () => {
  it("показывает текст блокировки с оператором и АРМ", () => {
    render(<LockedWindow operator={1000} name="Петров П П" arm={886} />);
    expect(screen.getByText("Вы не можете вносить изменения")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain(
      "В данный момент карточка заполняется пользователем:",
    );
    expect(screen.getByRole("alert").textContent).toContain("Оп. 1000 Петров П П; АРМ 886");
  });
});
