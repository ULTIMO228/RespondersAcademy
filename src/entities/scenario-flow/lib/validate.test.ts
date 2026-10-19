import { describe, expect, it } from "vitest";

import type { FlowDictionaries, FlowGraph, FlowNode } from "../model/types";
import { createDemoGraph, createEmptyGraph } from "./demo";
import { validateFlow } from "./validate";

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
  ddsStatuses: [
    { value: "accepted", label: "Принята", next: ["responseStarted"] },
    { value: "responseStarted", label: "Начало реагирования", next: ["arrived"] },
    { value: "workDone", label: "Работы завершены", next: [] },
  ],
  services: ["101", "102", "103", "104"].map((n) => ({ value: `svc-${n}`, label: `Служба ${n}` })),
  phoneNumbers: ["101", "103"].map((n) => ({ value: n, label: n })),
  signs: [{ value: "газификация", label: "газификация" }],
};

const codes = (graph: FlowGraph) => {
  const report = validateFlow(graph, dict);
  return {
    errors: report.errors.map((issue) => issue.code),
    warnings: report.warnings.map((issue) => issue.code),
    report,
  };
};

/** Минимальная корректная схема ДДС: Начало → Вызов → Действие → Завершение. */
function linear(extra: Partial<FlowNode["props"]> = {}): FlowGraph {
  const graph = createEmptyGraph("Тест", "dds");
  return {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: "n3",
        type: "incomingCall",
        position: { x: 0, y: 0 },
        props: { source: "bank", cardId: "c-010" },
      },
      {
        id: "n4",
        type: "action",
        position: { x: 0, y: 0 },
        props: { what: "setStatus", status: "accepted", deadlineSec: 30, points: 1, ...extra },
      },
    ],
    edges: [
      { id: "e1", from: { node: "n1", port: "next" }, to: { node: "n3" } },
      { id: "e2", from: { node: "n3", port: "next" }, to: { node: "n4" } },
      { id: "e3", from: { node: "n4", port: "done" }, to: { node: "n2" } },
    ],
  };
}

describe("validateFlow", () => {
  it("демо по билету 4.1 проходит без ошибок: 4 пути, максимум 10 баллов", () => {
    const { report } = codes(createDemoGraph());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.stats).toMatchObject({ paths: 4, maxScore: 10 });
  });

  it("минимальная линейная схема корректна (парный случай к отказам ниже)", () => {
    expect(codes(linear()).errors).toEqual([]);
  });

  it("новый пустой сценарий: у «Начала» нет следующего шага, «Завершение» недостижимо", () => {
    const { errors, report } = codes(createEmptyGraph("Новый", "dds"));
    expect(errors).toEqual(expect.arrayContaining(["E05", "E04"]));
    expect(report.ok).toBe(false);
    expect(report.errors.find((issue) => issue.code === "E05")?.message).toContain(
      "не указан следующий шаг для «Следующий шаг»",
    );
  });

  it("E01 и E02: два «Начала» и нет «Завершения»", () => {
    const graph = linear();
    const twoStarts = {
      ...graph,
      nodes: [...graph.nodes, { id: "n9", type: "start" as const, position: { x: 0, y: 0 }, props: {} }],
    };
    expect(codes(twoStarts).errors).toContain("E01");
    const noEnd = { ...graph, nodes: graph.nodes.filter((node) => node.type !== "end") };
    expect(codes(noEnd).errors).toContain("E02");
  });

  it("E03: круг называется по шагам", () => {
    const graph = linear();
    const looped = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === "e3" ? { ...edge, to: { node: "n3" } } : edge)),
    };
    const { errors, report } = codes(looped);
    expect(errors).toContain("E03");
    expect(report.errors.find((issue) => issue.code === "E03")?.message).toMatch(
      /Стрелки образуют круг: Шаг/,
    );
  });

  it("E07: не заполнена обязательная настройка, видимая при выбранном варианте", () => {
    const { report } = codes(linear({ status: "" }));
    expect(report.errors).toEqual([
      expect.objectContaining({ code: "E07", nodeId: "n4", message: expect.stringContaining("«Статус»") }),
    ]);
  });

  it("E08: значение не из справочника и действие не для этого режима", () => {
    expect(codes(linear({ status: "unknown" })).errors).toContain("E08");
    const graph = { ...linear(), mode: "operator112" as const };
    expect(
      codes(graph)
        .report.errors.map((issue) => issue.message)
        .join(" "),
    ).toContain("недоступно в режиме «Специалист 112»");
  });

  it("E09: действие без входящего вызова на пути", () => {
    const graph = linear();
    const noCall = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === "e1" ? { ...edge, to: { node: "n4" } } : edge)),
    };
    expect(codes(noCall).errors).toContain("E09");
  });

  it("E10: путь до завершения без единой проверки", () => {
    const graph = linear();
    const skip = {
      ...graph,
      edges: graph.edges.map((edge) => (edge.id === "e2" ? { ...edge, to: { node: "n2" } } : edge)),
    };
    expect(codes(skip).errors).toContain("E10");
  });

  it("E12: нулевой вес случайного варианта", () => {
    const graph = createDemoGraph();
    const withRandom: FlowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "n99",
          type: "randomVariant",
          position: { x: 0, y: 0 },
          props: { variants: "2", weightA: 0, weightB: 1 },
        },
      ],
    };
    expect(codes(withRandom).errors).toContain("E12");
  });

  it("W01, W03, W06 — предупреждения не блокируют публикацию", () => {
    const graph = linear({ deadlineSec: 240 });
    const withDone: FlowGraph = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          id: "n5",
          type: "action",
          position: { x: 0, y: 0 },
          props: { what: "setStatus", status: "workDone", points: 1 },
        },
      ],
      edges: [
        ...graph.edges.filter((edge) => edge.id !== "e3"),
        { id: "e3", from: { node: "n4", port: "done" }, to: { node: "n5" } },
        { id: "e4", from: { node: "n5", port: "done" }, to: { node: "n2" } },
        { id: "e5", from: { node: "n4", port: "missed" }, to: { node: "n2" } },
      ],
    };
    const { errors, warnings, report } = codes(withDone);
    expect(errors).toEqual([]);
    expect(warnings).toEqual(expect.arrayContaining(["W01", "W03", "W06"]));
    expect(report.ok).toBe(true);
    expect(report.warnings.find((issue) => issue.code === "W01")?.message).toContain(
      "после «Принята» по справочнику идёт «Начало реагирования»",
    );
  });
});
