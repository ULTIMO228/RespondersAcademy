/*
 * Демонстрационный сценарий — билет 4, ситуация 1 (c-010, data-model.md §11): «Горит балкон на 13-м этаже,
 * № дома неизвестен, в доме библиотека № 193 (ул. Грина, 11). Дом 14 эт., газифицирован». Режим — специалист 112.
 */
import type { FlowEdge, FlowGraph, FlowMode, FlowNode, FlowSettings } from "../model/types";
import { autoLayout } from "./layout";

export const DEFAULT_FLOW_SETTINGS: FlowSettings = {
  primaryReactionSec: 30,
  fullProcessingSec: 180,
  lateCreditPercent: 50,
  hintPenalty: 1,
  passThreshold: 70,
  description: "",
};

const at = { x: 0, y: 0 };

function node(id: string, type: FlowNode["type"], props: FlowNode["props"] = {}, title?: string): FlowNode {
  return { id, type, position: at, props, ...(title ? { title } : {}) };
}

function edge(id: string, from: string, port: string, to: string): FlowEdge {
  return { id, from: { node: from, port }, to: { node: to } };
}

export function createDemoGraph(): FlowGraph {
  const nodes: FlowNode[] = [
    node("n1", "start"),
    node("n2", "incomingCall", { source: "bank", cardId: "c-010" }),
    node("n3", "callerReply", {
      text: "Горит балкон на тринадцатом этаже! Номер дома не знаю, там библиотека.",
    }),
    node(
      "n4",
      "requiredQuestion",
      {
        field: "addressRefined",
        match: "similar",
        expected: "ул. Грина, 11",
        deadlineSec: 60,
        points: 3,
        critical: true,
      },
      "Уточнить адрес",
    ),
    node("n5", "callerReply", { text: "Это дом, где библиотека сто девяносто три." }),
    node(
      "n6",
      "requiredQuestion",
      { field: "floors", match: "range", expected: "14–14", deadlineSec: 0, points: 1, critical: false },
      "Этажность дома",
    ),
    node(
      "n7",
      "condition",
      { check: "field", field: "gas", expected: "да", waitSec: 60 },
      "Дом газифицирован?",
    ),
    node("n8", "action", {
      what: "notifyService",
      service: "svc-104",
      deadlineSec: 60,
      orderMatters: false,
      points: 2,
      critical: false,
    }),
    node("n9", "hint", { text: "Уточните у заявителя, газифицирован ли дом.", points: 1 }),
    node("n10", "action", {
      what: "notifyService",
      service: "svc-104",
      deadlineSec: 60,
      orderMatters: false,
      points: 2,
      critical: false,
    }),
    node("n11", "action", {
      what: "notifyService",
      service: "svc-101",
      deadlineSec: 60,
      orderMatters: false,
      points: 3,
      critical: true,
    }),
    node("n12", "action", {
      what: "notifyService",
      service: "svc-102",
      deadlineSec: 120,
      orderMatters: false,
      points: 1,
      critical: false,
    }),
    node("n13", "forbiddenAction", {
      what: "notifyService",
      service: "svc-103",
      reason: "Пострадавших нет — бригада СМП не требуется",
      points: 1,
      critical: false,
    }),
    node("n14", "end", { outcome: "success", message: "Вызов отработан: адрес уточнён, службы оповещены." }),
  ];
  const edges: FlowEdge[] = [
    edge("e1", "n1", "next", "n2"),
    edge("e2", "n2", "next", "n3"),
    edge("e3", "n3", "next", "n13"),
    edge("e16", "n13", "next", "n4"),
    edge("e4", "n4", "correct", "n6"),
    edge("e5", "n4", "wrong", "n5"),
    edge("e6", "n5", "next", "n6"),
    edge("e7", "n6", "correct", "n7"),
    edge("e8", "n7", "yes", "n8"),
    edge("e9", "n7", "no", "n9"),
    edge("e10", "n9", "next", "n10"),
    edge("e11", "n8", "done", "n11"),
    edge("e12", "n10", "done", "n11"),
    edge("e13", "n11", "done", "n12"),
    edge("e14", "n12", "done", "n14"),
  ];
  return autoLayout({
    schemaVersion: "flow/1",
    title: "Пожар в жилом доме: газ (билет 4.1)",
    mode: "operator112",
    nodes,
    edges,
    settings: {
      ...DEFAULT_FLOW_SETTINGS,
      description: "Очевидец сообщает о пожаре на 13-м этаже. Уточните адрес и оповестите службы.",
    },
  });
}

/** Новый сценарий: «Начало» и «Завершение», связь между ними автор добавит сам («+ Добавить первый шаг»). */
export function createEmptyGraph(title: string, mode: FlowMode): FlowGraph {
  return {
    schemaVersion: "flow/1",
    title,
    mode,
    nodes: [
      { id: "n1", type: "start", position: { x: 190, y: 40 }, props: {} },
      { id: "n2", type: "end", position: { x: 190, y: 420 }, props: { outcome: "success", message: "" } },
    ],
    edges: [],
    settings: { ...DEFAULT_FLOW_SETTINGS },
  };
}

/** Схема из хранилища: принимается только формат flow/1 с массивами блоков и связей. */
export function parseStoredGraph(raw: string | null): FlowGraph | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<FlowGraph>;
    if (value?.schemaVersion !== "flow/1" || !Array.isArray(value.nodes) || !Array.isArray(value.edges))
      return null;
    return {
      schemaVersion: "flow/1",
      title: String(value.title ?? "Без названия"),
      mode: value.mode === "dds" ? "dds" : "operator112",
      nodes: value.nodes,
      edges: value.edges,
      settings: { ...DEFAULT_FLOW_SETTINGS, ...(value.settings ?? {}) },
    };
  } catch {
    return null;
  }
}
