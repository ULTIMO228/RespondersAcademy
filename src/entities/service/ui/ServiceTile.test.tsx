import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ServiceTile } from "./ServiceTile";

describe("ServiceTile", () => {
  it("рендерит имя и строку статуса", () => {
    render(<ServiceTile name="Служба 101" statusLine="11:14 Добавлена" />);
    expect(screen.getByText("Служба 101")).toBeInTheDocument();
    expect(screen.getByText("11:14 Добавлена")).toBeInTheDocument();
  });

  it("основная служба помечена двойным подчёркиванием", () => {
    render(<ServiceTile name="Служба 101" statusLine="11:14 Добавлена" isMain />);
    expect(screen.getByText("Служба 101").className).toContain("tile__name--main");
    expect(screen.getByTitle("Служба 101")).toHaveAttribute("data-main", "true");
  });

  it("«только телефонная» и активная плитки различимы", () => {
    const { rerender } = render(<ServiceTile name="Только телефон" statusLine="" isPhoneOnly />);
    expect(screen.getByTitle("Только телефон").className).toContain("tile--phone-only");
    rerender(<ServiceTile name="Только телефон" statusLine="" isActive />);
    expect(screen.getByTitle("Только телефон").className).toContain("tile--active");
  });
});
