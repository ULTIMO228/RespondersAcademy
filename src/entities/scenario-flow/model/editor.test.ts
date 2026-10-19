import { describe, expect, it } from "vitest";

import { createDemoGraph, createEmptyGraph } from "../lib/demo";
import { edgeFromPort, nodeById } from "../lib/graph";
import { createEditorState, FLOW_HISTORY_LIMIT, flowEditorReducer } from "./editor";
import type { FlowEditorAction, FlowEditorState } from "./editor";

const at = "2026-10-19T10:00:00+03:00";
const run = (state: FlowEditorState, ...actions: FlowEditorAction[]) =>
  actions.reduce(flowEditorReducer, state);

describe("flowEditorReducer", () => {
  it("добавляет блок после выхода и выделяет его", () => {
    const state = run(createEditorState(createEmptyGraph("Т", "dds")), {
      type: "addNode",
      nodeType: "incomingCall",
      position: { x: 0, y: 160 },
      after: { node: "n1", port: "next" },
      at,
    });
    const added = state.graph.nodes.find((node) => node.type === "incomingCall")!;
    expect(edgeFromPort(state.graph, "n1", "next")?.to.node).toBe(added.id);
    expect(state.selection).toEqual({ kind: "node", id: added.id });
    expect(state.past).toHaveLength(1);
    expect(state.log[0].label).toBe("Добавлен блок «Входящий вызов»");
  });

  it("вставляет блок в середину связи: A → новый → B", () => {
    const demo = createDemoGraph();
    const state = run(createEditorState(demo), {
      type: "addNode",
      nodeType: "hint",
      position: { x: 0, y: 0 },
      onEdge: "e1",
      at,
    });
    const hint = state.graph.nodes.find(
      (node) => node.type === "hint" && !demo.nodes.some((old) => old.id === node.id),
    )!;
    expect(edgeFromPort(state.graph, "n1", "next")?.to.node).toBe(hint.id);
    expect(edgeFromPort(state.graph, hint.id, "next")?.to.node).toBe("n2");
  });

  it("новая связь из того же выхода заменяет старую", () => {
    const state = run(createEditorState(createDemoGraph()), {
      type: "connect",
      from: { node: "n7", port: "yes" },
      to: "n10",
      at,
    });
    expect(
      state.graph.edges.filter((edge) => edge.from.node === "n7" && edge.from.port === "yes"),
    ).toHaveLength(1);
    expect(edgeFromPort(state.graph, "n7", "yes")?.to.node).toBe("n10");
  });

  it("связь, замыкающая круг, не создаётся и даёт сообщение", () => {
    const before = createEditorState(createDemoGraph());
    const state = run(before, { type: "connect", from: { node: "n11", port: "done" }, to: "n2", at });
    expect(state.graph).toBe(before.graph);
    expect(state.notice).toEqual({ kind: "cycle" });
    expect(state.past).toHaveLength(0);
  });

  it("удаление блока убирает его связи; «Начало» удалить нельзя", () => {
    const state = run(createEditorState(createDemoGraph()), { type: "deleteNode", id: "n9", at });
    expect(nodeById(state.graph, "n9")).toBeUndefined();
    expect(state.graph.edges.some((edge) => edge.from.node === "n9" || edge.to.node === "n9")).toBe(false);
    expect(state.notice).toEqual({ kind: "removed", label: "Шаг «Подсказка» удалён" });
    const kept = run(state, { type: "deleteNode", id: "n1", at });
    expect(nodeById(kept.graph, "n1")).toBeDefined();
  });

  it("удаление выделенной связи", () => {
    const state = run(
      createEditorState(createDemoGraph()),
      { type: "select", selection: { kind: "edge", id: "e9" } },
      { type: "deleteSelection", at },
    );
    expect(state.graph.edges.some((edge) => edge.id === "e9")).toBe(false);
  });

  it("отмена и повтор возвращают граф; новая правка очищает повтор", () => {
    const initial = createEditorState(createDemoGraph());
    const edited = run(initial, { type: "deleteNode", id: "n9", at });
    const undone = run(edited, { type: "undo" });
    expect(undone.graph).toEqual(initial.graph);
    expect(undone.future).toHaveLength(1);
    const redone = run(undone, { type: "redo" });
    expect(redone.graph).toEqual(edited.graph);
    const branched = run(undone, { type: "updateGraph", patch: { title: "Новое" }, at });
    expect(branched.future).toEqual([]);
    expect(run(createEditorState(createDemoGraph()), { type: "undo" }).past).toEqual([]);
  });

  it("перетаскивание — один шаг истории: checkpoint, затем перемещения без записи", () => {
    const state = run(
      createEditorState(createDemoGraph()),
      { type: "checkpoint", label: "Передвинут блок", at },
      { type: "moveNode", id: "n2", position: { x: 10, y: 10 }, record: false, at },
      { type: "moveNode", id: "n2", position: { x: 20, y: 20 }, record: false, at },
    );
    expect(state.past).toHaveLength(1);
    expect(nodeById(state.graph, "n2")?.position).toEqual({ x: 20, y: 20 });
    expect(nodeById(run(state, { type: "undo" }).graph, "n2")?.position).not.toEqual({ x: 20, y: 20 });
  });

  it(`история ограничена ${FLOW_HISTORY_LIMIT} шагами`, () => {
    let state = createEditorState(createDemoGraph());
    for (let index = 0; index < FLOW_HISTORY_LIMIT + 5; index += 1)
      state = run(state, { type: "updateGraph", patch: { title: `Т${index}` }, at });
    expect(state.past).toHaveLength(FLOW_HISTORY_LIMIT);
  });

  it("уменьшение числа вариантов убирает связь пропавшего выхода", () => {
    let state = createEditorState(createDemoGraph());
    state = run(state, {
      type: "addNode",
      nodeType: "randomVariant",
      position: { x: 0, y: 0 },
      props: { variants: "3" },
      at,
    });
    const random = state.graph.nodes.find((node) => node.type === "randomVariant")!;
    state = run(state, { type: "connect", from: { node: random.id, port: "c" }, to: "n14", at });
    expect(edgeFromPort(state.graph, random.id, "c")).toBeDefined();
    state = run(state, { type: "updateNode", id: random.id, props: { variants: "2" }, at });
    expect(edgeFromPort(state.graph, random.id, "c")).toBeUndefined();
  });
});
