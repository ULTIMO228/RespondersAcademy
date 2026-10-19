import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ViewSwitch } from "./ViewSwitch";

describe("переключатель «Карта / Журнал»", () => {
  it("помечает текущий вид и ведёт на оба адреса", () => {
    render(<ViewSwitch active="journal" mapHref="/m?period=1m" journalHref="/j?period=1m" />);
    expect(screen.getByRole("navigation", { name: "Вид раздела" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Журнал" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Карта" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Карта" })).toHaveAttribute("href", "/m?period=1m");
    expect(screen.getByRole("link", { name: "Журнал" })).toHaveAttribute("href", "/j?period=1m");
  });
});
