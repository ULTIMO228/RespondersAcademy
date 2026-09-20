import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TimerBadge } from "./TimerBadge";

describe("TimerBadge", () => {
  it("помечает превышение норматива", () => {
    render(<TimerBadge value="3:12" exceeded caption="Отработка" />);
    const timer = screen.getByRole("timer");
    expect(timer).toHaveAttribute("data-exceeded", "true");
    expect(timer.className).toContain("timer--exceeded");
  });

  it("в норме не помечен", () => {
    render(<TimerBadge value="0:30" />);
    expect(screen.getByRole("timer")).toHaveAttribute("data-exceeded", "false");
  });
});
