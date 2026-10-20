import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardTimer } from "./CardTimer";

describe("CardTimer", () => {
  it("тёмный до порога: текст, подписи и aria-label", () => {
    render(<CardTimer text="01:23" isRed={false} />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("aria-label", "Время работы с карточкой: 1 минута 23 секунды");
    expect(timer).toHaveTextContent("01:23");
    expect(timer.className).not.toMatch(/timer--red/);
    expect(screen.getByText("минут")).toBeInTheDocument();
    expect(screen.getByText("секунд")).toBeInTheDocument();
  });

  it("красный только блок таймера", () => {
    const { rerender } = render(<CardTimer text="01:00" isRed={false} />);
    expect(screen.getByRole("timer").className).not.toMatch(/timer--red/);
    rerender(<CardTimer text="01:01" isRed />);
    expect(screen.getByRole("timer").className).toMatch(/timer--red/);
  });

  it("минуты больше 99 не обрезаются; склонение секунд", () => {
    render(<CardTimer text="100:02" isRed />);
    expect(screen.getByRole("timer")).toHaveAttribute(
      "aria-label",
      "Время работы с карточкой: 100 минут 2 секунды",
    );
  });
});
