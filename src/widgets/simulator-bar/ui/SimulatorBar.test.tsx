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
