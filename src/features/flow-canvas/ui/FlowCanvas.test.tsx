import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createDemoGraph, createEmptyGraph } from "@/entities/scenario-flow";
import type { FlowDictionaries, FlowGraph, FlowSelection } from "@/entities/scenario-flow";

import { FlowCanvas } from "./FlowCanvas";

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

function setup(graph: FlowGraph = createDemoGraph(), selection: FlowSelection = null, readOnly = false) {
  const handlers = {
    onSelect: vi.fn(),
    onMoveStart: vi.fn(),
    onMove: vi.fn(),
    onConnect: vi.fn(),
    onAdd: vi.fn(),
    onDelete: vi.fn(),
    onAlign: vi.fn(),
    onShowKeys: vi.fn(),
    onOpenInspector: vi.fn(),
  };
  render(
    <FlowCanvas
      graph={graph}
      dict={dict}
      selection={selection}
      issues={[]}
      readOnly={readOnly}
      {...handlers}
    />,
  );
  return handlers;
}

const node = (step: number) => screen.getByRole("button", { name: new RegExp(`^Шаг ${step}, `) });

describe("FlowCanvas", () => {
  it("рисует блоки с понятной подписью для диктора и мини-карту", () => {
    setup();
    expect(node(1)).toHaveAccessibleName(
      /Шаг 1, Начало: Начало сценария\. выход «Следующий шаг» ведёт к шагу 2/,
    );
    expect(screen.getByRole("img", { name: /Мини-карта: 14 блоков/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Мини-карта" }));
    expect(screen.queryByRole("img", { name: /Мини-карта/ })).not.toBeInTheDocument();
  });

  it("клавиатура: ↓ — к следующему шагу, Delete — удалить, Enter — свойства, Ctrl+стрелка — сдвиг", () => {
    const handlers = setup(createDemoGraph(), { kind: "node", id: "n2" });
    const call = node(2);
    fireEvent.keyDown(call, { key: "ArrowDown" });
    expect(handlers.onSelect).toHaveBeenLastCalledWith({ kind: "node", id: "n3" });
    fireEvent.keyDown(call, { key: "Delete" });
    expect(handlers.onDelete).toHaveBeenCalled();
    fireEvent.keyDown(call, { key: "Enter" });
    expect(handlers.onOpenInspector).toHaveBeenCalled();
    fireEvent.keyDown(call, { key: "ArrowRight", ctrlKey: true });
    expect(handlers.onMove).toHaveBeenCalledWith("n2", expect.objectContaining({}), true);
  });

  it("фокус на блоке выделяет его", () => {
    const handlers = setup();
    fireEvent.focus(node(3));
    expect(handlers.onSelect).toHaveBeenCalledWith({ kind: "node", id: "n3" });
  });

  it("«+ Добавить шаг» на свободном выходе открывает выбор блока и добавляет его после выхода", () => {
    const handlers = setup(createEmptyGraph("Новый", "dds"));
    fireEvent.click(screen.getByRole("button", { name: /Добавить шаг после шага 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Входящий вызов" }));
    expect(handlers.onAdd).toHaveBeenCalledWith({ type: "incomingCall" }, expect.any(Object), {
      after: { node: "n1", port: "next" },
    });
  });

  it("«+» есть только у выделенной связи и вставляет шаг между шагами", () => {
    const { unmount } = render(
      <FlowCanvas
        graph={createDemoGraph()}
        dict={dict}
        selection={null}
        issues={[]}
        onSelect={vi.fn()}
        onMoveStart={vi.fn()}
        onMove={vi.fn()}
        onConnect={vi.fn()}
        onAdd={vi.fn()}
        onDelete={vi.fn()}
        onAlign={vi.fn()}
        onShowKeys={vi.fn()}
        onOpenInspector={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Вставить шаг между/ })).not.toBeInTheDocument();
    unmount();
    const handlers = setup(createDemoGraph(), { kind: "edge", id: "e1" });
    fireEvent.click(screen.getByRole("button", { name: "Вставить шаг между шагами 1 и 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Подсказка" }));
    expect(handlers.onAdd).toHaveBeenCalledWith({ type: "hint" }, expect.any(Object), { onEdge: "e1" });
  });

  it("в режиме просмотра нет кнопок добавления и удаления", () => {
    const handlers = setup(createEmptyGraph("Новый", "dds"), { kind: "node", id: "n1" }, true);
    expect(screen.queryByRole("button", { name: /Добавить шаг/ })).not.toBeInTheDocument();
    fireEvent.keyDown(node(1), { key: "Delete" });
    expect(handlers.onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Выровнять схему" })).not.toBeInTheDocument();
  });

  it("выделенная связь удаляется клавишей Delete на поле (парный случай: без выделения ничего не удаляется)", () => {
    const withEdge = setup(createDemoGraph(), { kind: "edge", id: "e2" });
    const field = screen.getByLabelText(/^Поле схемы/);
    fireEvent.keyDown(field, { key: "Delete" });
    expect(withEdge.onDelete).toHaveBeenCalledTimes(1);
  });

  it("без выделения Delete на поле ничего не удаляет", () => {
    const handlers = setup();
    fireEvent.keyDown(screen.getByLabelText(/^Поле схемы/), { key: "Delete" });
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });
});
