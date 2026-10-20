import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { createDemoGraph, recordPreviewEvent, startPreview } from "@/entities/scenario-flow";
import type { FlowDictionaries } from "@/entities/scenario-flow";

import { FlowPreviewPanel } from "./FlowPreviewPanel";

const dict: FlowDictionaries = {
  cards: [
    {
      value: "c-010",
      label: "Билет 4.1",
      summary: "Горит балкон",
      address: "ул. Грина",
      callerName: "",
      callerPhone: "",
    },
  ],
  ddsStatuses: [],
  services: ["101", "102"].map((n) => ({ value: `svc-${n}`, label: `Служба ${n}` })),
  phoneNumbers: [],
  signs: [],
};

function Harness() {
  const graph = createDemoGraph();
  const [state, setState] = useState(() => startPreview(graph, dict, { seed: 1 }));
  return (
    <FlowPreviewPanel
      graph={graph}
      dict={dict}
      state={state}
      result={null}
      onEvent={(event) => setState((current) => recordPreviewEvent(graph, dict, current, event))}
      onWait={vi.fn()}
      onFinish={vi.fn()}
      onRestart={vi.fn()}
      onStop={vi.fn()}
    />
  );
}

describe("FlowPreviewPanel", () => {
  it("записанный ответ не пропадает: у поля «✓ Записано», в «Моих действиях» — строка", () => {
    render(<Harness />);
    const mine = screen.getByRole("region", { name: "Мои действия" });
    expect(mine).toHaveTextContent("Пока ничего не отмечено");
    fireEvent.change(screen.getByLabelText("Указать значение поля"), { target: { value: "addressRefined" } });
    const input = screen.getByRole("textbox", { name: "Значение" });
    fireEvent.change(input, { target: { value: "ул. Грина, 11" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Записать" })[0]!);
    expect(input).toHaveValue("");
    expect(screen.getByText(/✓ Записано: .*«ул\. Грина, 11»/)).toBeInTheDocument();
    expect(within(mine).getByText(/«ул\. Грина, 11»/)).toBeInTheDocument();
  });

  it("пустое значение записать нельзя (парный случай)", () => {
    render(<Harness />);
    expect(screen.getAllByRole("button", { name: "Записать" })[0]).toBeDisabled();
    expect(screen.queryByText(/✓ Записано/)).not.toBeInTheDocument();
  });
});
