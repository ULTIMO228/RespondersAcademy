import { describe, expect, it } from "vitest";

import { sampleGraph } from "./fixtures";
import {
  addBranch,
  addNode,
  emptyEditorGraph,
  findDanglingEdges,
  findUnusedNodes,
  fromGraph,
  listEdges,
  localChecks,
  moveNode,
  removeBranch,
  removeNode,
  renameNode,
  setConnection,
  toGraph,
} from "./model";

describe("fromGraph / toGraph", () => {
  it("круг без потерь: поля узлов, decoys, scoring и layout сохраняются", () => {
    const graph = sampleGraph();
    expect(toGraph(fromGraph(graph))).toEqual(graph);
  });

  it("не мутирует исходный граф и убирает пустые строки и layout несуществующих узлов", () => {
    const graph = sampleGraph();
    const state = fromGraph(graph);
    state.nodes[0] = { ...state.nodes[0], title: "  ", prompt: "" };
    state.layout.ghost = { x: 1, y: 2 };
    const result = toGraph(state);
    expect(result.nodes[0]).not.toHaveProperty("title");
    expect(result.nodes[0]).not.toHaveProperty("prompt");
    expect(result.layout).not.toHaveProperty("ghost");
    expect(graph.nodes[0].title).toBe("Приём вызова");
  });

  it("не отдаёт пустые необязательные секции", () => {
    const result = toGraph(addNode(emptyEditorGraph(), "end").graph);
    expect(result).not.toHaveProperty("decoys");
    expect(result).not.toHaveProperty("scoring");
    expect(result.start).toBe("end1");
  });
});

describe("addNode / removeNode", () => {
  it("даёт уникальные id и делает первый блок стартовым", () => {
    let state = emptyEditorGraph();
    const first = addNode(state, "action");
    state = first.graph;
    const second = addNode(state, "action");
    expect(first.id).toBe("step1");
    expect(second.id).toBe("step2");
    expect(second.graph.start).toBe("step1");
    expect(second.graph.layout.step2.y).toBeGreaterThan(second.graph.layout.step1.y);
  });

  it("удаление очищает next, цели веток и else, переносит start и layout", () => {
    const state = fromGraph(sampleGraph());
    const afterN4 = removeNode(state, "n4");
    const cond = afterN4.nodes.find((node) => node.id === "n3");
    expect(cond?.branches?.[0].next).toBe("");
    expect(cond?.else?.next).toBe("n5");
    expect(afterN4.layout).not.toHaveProperty("n4");

    const afterN2 = removeNode(state, "n2");
    expect(afterN2.nodes.find((node) => node.id === "n1")).not.toHaveProperty("next");

    const afterStart = removeNode(state, "n1");
    expect(afterStart.start).toBe("n2");
    expect(afterStart.layout).not.toHaveProperty("n1");
  });
});

describe("renameNode", () => {
  it("обновляет start, next, ветки, else и layout", () => {
    const state = fromGraph(sampleGraph());
    const renamed = renameNode(state, "n1", "intake");
    expect(renamed.ok).toBe(true);
    if (!renamed.ok) return;
    expect(renamed.graph.start).toBe("intake");
    expect(renamed.graph.layout.intake).toEqual({ x: 80, y: 60 });
    const toThree = renameNode(renamed.graph, "n3", "decide");
    if (!toThree.ok) throw new Error("rename failed");
    expect(toThree.graph.nodes.find((node) => node.id === "n2")?.next).toBe("decide");
    const toEnd = renameNode(toThree.graph, "n4", "good");
    if (!toEnd.ok) throw new Error("rename failed");
    expect(toEnd.graph.nodes.find((node) => node.id === "decide")?.branches?.[0].next).toBe("good");
    const toElse = renameNode(toEnd.graph, "n5", "bad");
    if (!toElse.ok) throw new Error("rename failed");
    expect(toElse.graph.nodes.find((node) => node.id === "decide")?.else?.next).toBe("bad");
  });

  it("отказывает на занятый и некорректный id (и пропускает корректный)", () => {
    const state = fromGraph(sampleGraph());
    expect(renameNode(state, "n1", "n2")).toMatchObject({ ok: false });
    expect(renameNode(state, "n1", "с пробелом")).toMatchObject({ ok: false });
    expect(renameNode(state, "n1", "")).toMatchObject({ ok: false });
    expect(renameNode(state, "n1", "ok_id-1")).toMatchObject({ ok: true });
  });
});

describe("соединения и ветки", () => {
  it("setConnection меняет цель шага, ветки и else; пустая цель снимает соединение", () => {
    let state = fromGraph(sampleGraph());
    state = setConnection(state, "n1", { kind: "next" }, "n5");
    state = setConnection(state, "n3", { kind: "branch", index: 0 }, "n5");
    state = setConnection(state, "n3", { kind: "else" }, "n4");
    expect(state.nodes[0].next).toBe("n5");
    expect(state.nodes[2].branches?.[0].next).toBe("n5");
    expect(state.nodes[2].else?.next).toBe("n4");
    state = setConnection(state, "n1", { kind: "next" }, "");
    expect(state.nodes[0]).not.toHaveProperty("next");
  });

  it("addBranch даёт уникальное имя, removeBranch не удаляет последнюю ветку", () => {
    let state = fromGraph(sampleGraph());
    state = addBranch(state, "n3");
    state = addBranch(state, "n3");
    const names = state.nodes[2].branches?.map((branch) => branch.name);
    expect(new Set(names).size).toBe(3);
    state = removeBranch(state, "n3", 1);
    state = removeBranch(state, "n3", 1);
    expect(state.nodes[2].branches).toHaveLength(1);
    expect(removeBranch(state, "n3", 0).nodes[2].branches).toHaveLength(1);
  });

  it("moveNode обновляет layout только существующего блока", () => {
    const state = fromGraph(sampleGraph());
    expect(moveNode(state, "n1", { x: 5, y: 6 }).layout.n1).toEqual({ x: 5, y: 6 });
    expect(moveNode(state, "zzz", { x: 5, y: 6 })).toBe(state);
  });
});

describe("поиск проблем", () => {
  it("находит висящие связи, недостижимые блоки и локальные ошибки", () => {
    let state = fromGraph(sampleGraph());
    expect(findDanglingEdges(state)).toHaveLength(0);
    expect(findUnusedNodes(state)).toEqual([]);
    expect(localChecks(state)).toEqual([]);

    state = setConnection(state, "n3", { kind: "else" }, "");
    state = setConnection(state, "n1", { kind: "next" }, "ghost");
    expect(findDanglingEdges(state).map((edge) => edge.key)).toEqual(["n1:next", "n3:else"]);
    expect(findUnusedNodes(state)).toEqual(["n2", "n3", "n4", "n5"]);
    const checks = localChecks(state);
    expect(checks).toHaveLength(2);
    expect(checks[0]).toMatchObject({ nodeId: "n1" });
    expect(checks[0].message).toContain("ghost");

    expect(localChecks({ ...state, start: "" })[0].message).toBe("Не выбран стартовый блок");
    expect(localChecks({ ...state, start: "nope" })[0].message).toContain("nope");
    expect(localChecks(emptyEditorGraph())[0].message).toContain("нет ни одного блока");
  });

  it("listEdges подписывает ветки и else", () => {
    const labels = listEdges(fromGraph(sampleGraph())).map((edge) => edge.label);
    expect(labels).toEqual(["", "", "Дерево", "Иначе"]);
  });
});
