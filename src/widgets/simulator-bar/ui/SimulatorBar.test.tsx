import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SimulatorBar } from "./SimulatorBar";
import { SimulatorBarSlot } from "./SimulatorBarSlot";

vi.mock("@/features/arm-reference", () => ({ ReferenceToggle: () => null }));

describe("SimulatorBar — слот экрана (спека 012 FR-002)", () => {
  it("содержимое SimulatorBarSlot попадает в полосу тренажёра, а не на место вызова", async () => {
    render(
      <>
        <SimulatorBar />
        <section aria-label="Экран АРМ">
          <SimulatorBarSlot>
            <span>Норматив реакции 0:30</span>
          </SimulatorBarSlot>
        </section>
      </>,
    );
    const bar = document.querySelector<HTMLElement>("[data-simulator-bar]");
    expect(bar).not.toBeNull();
    expect(await within(bar as HTMLElement).findByText("Норматив реакции 0:30")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Экран АРМ" })).queryByText(/Норматив/)).toBeNull();
  });

  it("без полосы тренажёра слот ничего не рисует", () => {
    render(
      <SimulatorBarSlot>
        <span>Норматив реакции 0:30</span>
      </SimulatorBarSlot>,
    );
    expect(screen.queryByText(/Норматив/)).toBeNull();
  });
});

describe("SimulatorBar: «В кабинет» и переключатель зон (спека 007)", () => {
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

  it("переключатель зон и слот экрана сосуществуют в одной полосе", async () => {
    render(
      <>
        <SimulatorBar zones={["operator112", "dds"]} currentZone="operator112" />
        <SimulatorBarSlot>
          <span>Норматив реакции 0:30</span>
        </SimulatorBarSlot>
      </>,
    );
    const bar = document.querySelector<HTMLElement>("[data-simulator-bar]") as HTMLElement;
    expect(within(bar).getByRole("navigation", { name: "Рабочая зона" })).toBeInTheDocument();
    expect(await within(bar).findByText("Норматив реакции 0:30")).toBeInTheDocument();
  });
});
