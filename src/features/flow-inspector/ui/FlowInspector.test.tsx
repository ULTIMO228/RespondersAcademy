import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDemoGraph } from "@/entities/scenario-flow";
import type { FlowDictionaries } from "@/entities/scenario-flow";

import { FlowInspector } from "./FlowInspector";

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
  services: ["101", "102", "103", "104"].map((n) => ({ value: `svc-${n}`, label: `Служба ${n}` })),
  phoneNumbers: [],
  signs: [],
};

function setup(selection: Parameters<typeof FlowInspector>[0]["selection"]) {
  const handlers = {
    onUpdateNode: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onDeleteNode: vi.fn(),
    onDuplicateNode: vi.fn(),
    onDeleteEdge: vi.fn(),
    onUpdateGraph: vi.fn(),
    onUpdateSettings: vi.fn(),
  };
  render(
    <FlowInspector graph={createDemoGraph()} dict={dict} selection={selection} issues={[]} {...handlers} />,
  );
  return handlers;
}

describe("FlowInspector", () => {
  it("без выделения — свойства сценария; название применяется при уходе из поля", () => {
    const handlers = setup(null);
    expect(screen.getByRole("heading", { name: "Сценарий" })).toBeInTheDocument();
    const title = screen.getByLabelText("Название сценария");
    fireEvent.change(title, { target: { value: "Пожар: новая версия" } });
    expect(handlers.onUpdateGraph).not.toHaveBeenCalled();
    fireEvent.blur(title);
    expect(handlers.onUpdateGraph).toHaveBeenCalledWith({ title: "Пожар: новая версия" });
  });

  it("блок «Действие»: служба меняется сразу, срок — по Enter, удаление — кнопкой", () => {
    const handlers = setup({ kind: "node", id: "n8" });
    expect(screen.getByRole("heading", { name: "Действие" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Служба"), { target: { value: "svc-101" } });
    expect(handlers.onUpdateNode).toHaveBeenLastCalledWith("n8", { props: { service: "svc-101" } });
    const deadline = screen.getByLabelText("Срок выполнения, секунд");
    fireEvent.change(deadline, { target: { value: "45" } });
    fireEvent.keyDown(deadline, { key: "Enter" });
    expect(handlers.onUpdateNode).toHaveBeenLastCalledWith("n8", { props: { deadlineSec: 45 } });
    fireEvent.click(screen.getByRole("button", { name: /Удалить шаг/ }));
    expect(handlers.onDeleteNode).toHaveBeenCalledWith("n8");
  });

  it("«Следующий шаг»: выбор связывает, шаги, замыкающие круг, недоступны", () => {
    const handlers = setup({ kind: "node", id: "n11" });
    const done = screen.getByLabelText("Выполнено");
    const options = [...(done as HTMLSelectElement).options];
    expect(options.find((option) => option.textContent?.includes("Входящий вызов"))?.disabled).toBe(true);
    const end = options.find((option) => option.textContent?.includes("Завершение"))!;
    expect(end.disabled).toBe(false);
    fireEvent.change(done, { target: { value: end.value } });
    expect(handlers.onConnect).toHaveBeenCalledWith({ node: "n11", port: "done" }, end.value);
    fireEvent.change(screen.getByLabelText("Не выполнено (необязательно)"), { target: { value: "" } });
    expect(handlers.onDisconnect).toHaveBeenCalledWith({ node: "n11", port: "missed" });
  });

  it("выбранная связь показывает, откуда и куда ведёт, и удаляется", () => {
    const handlers = setup({ kind: "edge", id: "e8" });
    expect(screen.getByRole("heading", { name: "Связь" })).toBeInTheDocument();
    expect(screen.getByText("«Да»")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Удалить связь/ }));
    expect(handlers.onDeleteEdge).toHaveBeenCalledWith("e8");
  });
});
