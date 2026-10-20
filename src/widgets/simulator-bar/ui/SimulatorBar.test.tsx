import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SimulatorBar } from "./SimulatorBar";

describe("SimulatorBar: «В кабинет» и переключатель зон", () => {
  it("одна специализация: переключателя нет, ссылка в кабинет на месте", () => {
    render(<SimulatorBar zones={["dds"]} currentZone="dds" />);
    expect(screen.getByRole("link", { name: /В кабинет/ })).toHaveAttribute("href", "/student");
    expect(screen.queryByRole("navigation", { name: "Рабочая зона" })).not.toBeInTheDocument();
  });

  it("две специализации: подпись текущей роли и ссылка на другую зону", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />);
    const nav = screen.getByRole("navigation", { name: "Рабочая зона" });
    expect(nav).toHaveTextContent("Специалист 112");
    expect(screen.getByRole("link", { name: "Оператор ДДС" })).toHaveAttribute("href", "/arm");
    expect(screen.queryByRole("link", { name: "Специалист 112" })).not.toBeInTheDocument();
  });

  it("из зоны ДДС ссылка ведёт в режим 112", () => {
    render(<SimulatorBar zones={["operator112", "dds"]} currentZone="dds" />);
    expect(screen.getByRole("link", { name: "Специалист 112" })).toHaveAttribute("href", "/arm/operator112");
  });
});
