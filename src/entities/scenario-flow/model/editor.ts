/*
 * Состояние редактора схемы и история правок (design-concept.md §11): каждое изменение — снимок графа с подписью,
 * отмена и повтор до 50 шагов. Перетаскивание пишет один шаг истории: «checkpoint» в начале, затем moveNode без записи.
 */
import { autoLayout } from "../lib/layout";
import { edgeFromPort, nodeById, wouldCreateCycle } from "../lib/graph";
import { FLOW_BLOCKS, defaultPropsFor, outputsOf } from "./catalog";
import type {
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeType,
  FlowPoint,
  FlowPropValue,
  FlowSelection,
  FlowSettings,
} from "./types";

export const FLOW_HISTORY_LIMIT = 50;

export interface FlowHistoryEntry {
  graph: FlowGraph;
  /** Что было сделано этим шагом — для вкладки «История изменений». */
  label: string;
  at: string;
}

export type FlowEditorNotice = { kind: "cycle" } | { kind: "removed"; label: string } | null;

export interface FlowEditorState {
  graph: FlowGraph;
  past: FlowHistoryEntry[];
  future: FlowHistoryEntry[];
  selection: FlowSelection;
  /** Растёт с каждой правкой; сравнивается с номером сохранённой версии («есть несохранённые изменения»). */
  revision: number;
  /** Журнал правок за сеанс (новые сверху). */
  log: { label: string; at: string }[];
  notice: FlowEditorNotice;
}

export type FlowEditorAction =
  | {
      type: "addNode";
      nodeType: FlowNodeType;
      position: FlowPoint;
      props?: Record<string, FlowPropValue>;
      title?: string;
      /** Подключить новый блок к выходу существующего. */
      after?: { node: string; port: string };
      /** Вставить блок в середину связи. */
      onEdge?: string;
      at: string;
    }
  | { type: "checkpoint"; label: string; at: string }
  | { type: "moveNode"; id: string; position: FlowPoint; record: boolean; at: string }
  | { type: "connect"; from: { node: string; port: string }; to: string; at: string }
  | { type: "disconnect"; from: { node: string; port: string }; at: string }
  | { type: "deleteSelection"; at: string }
  | { type: "deleteNode"; id: string; at: string }
  | { type: "deleteEdge"; id: string; at: string }
  | { type: "duplicateNode"; id: string; at: string }
  | { type: "updateNode"; id: string; props?: Record<string, FlowPropValue>; title?: string; at: string }
  | { type: "updateGraph"; patch: Partial<Pick<FlowGraph, "title" | "mode">>; at: string }
  | { type: "updateSettings"; patch: Partial<FlowSettings>; at: string }
  | { type: "autoLayout"; at: string }
  | { type: "replaceGraph"; graph: FlowGraph; label: string; at: string }
  | { type: "select"; selection: FlowSelection }
  | { type: "dismissNotice" }
  | { type: "undo" }
  | { type: "redo" };

export function createEditorState(graph: FlowGraph): FlowEditorState {
  return { graph, past: [], future: [], selection: null, revision: 0, log: [], notice: null };
}

function nextId(prefix: string, ids: string[]): string {
  const max = ids.reduce((acc, id) => {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, 0);
  return `${prefix}${max + 1}`;
}

function blockName(node: FlowNode | undefined): string {
  if (!node) return "блок";
  return node.title?.trim() || FLOW_BLOCKS[node.type].title;
}

/** Запись шага истории: прошлое пополняется текущим графом, будущее сбрасывается. */
function commit(
  state: FlowEditorState,
  graph: FlowGraph,
  label: string,
  at: string,
  extra: Partial<FlowEditorState> = {},
): FlowEditorState {
  const past = [...state.past, { graph: state.graph, label, at }].slice(-FLOW_HISTORY_LIMIT);
  return {
    ...state,
    ...extra,
    graph,
    past,
    future: [],
    revision: state.revision + 1,
    log: [{ label, at }, ...state.log].slice(0, 200),
    notice: extra.notice ?? null,
  };
}

function withEdge(graph: FlowGraph, from: { node: string; port: string }, to: string): FlowGraph {
  const kept = graph.edges.filter((edge) => !(edge.from.node === from.node && edge.from.port === from.port));
  const edge: FlowEdge = {
    id: nextId(
      "e",
      graph.edges.map((item) => item.id),
    ),
    from,
    to: { node: to },
  };
  return { ...graph, edges: [...kept, edge] };
}

function removeNode(graph: FlowGraph, id: string): FlowGraph {
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => node.id !== id),
    edges: graph.edges.filter((edge) => edge.from.node !== id && edge.to.node !== id),
  };
}

export function flowEditorReducer(state: FlowEditorState, action: FlowEditorAction): FlowEditorState {
  const { graph } = state;
  switch (action.type) {
    case "addNode": {
      const id = nextId(
        "n",
        graph.nodes.map((node) => node.id),
      );
      const node: FlowNode = {
        id,
        type: action.nodeType,
        position: action.position,
        props: defaultPropsFor(action.nodeType, action.props),
        ...(action.title ? { title: action.title } : {}),
      };
      let next: FlowGraph = { ...graph, nodes: [...graph.nodes, node] };
      const firstOutput = outputsOf(node)[0]?.port;
      if (action.onEdge) {
        const edge = graph.edges.find((item) => item.id === action.onEdge);
        if (edge) {
          next = { ...next, edges: next.edges.filter((item) => item.id !== edge.id) };
          next = withEdge(next, edge.from, id);
          if (firstOutput) next = withEdge(next, { node: id, port: firstOutput }, edge.to.node);
        }
      } else if (action.after && nodeById(graph, action.after.node)) {
        const previous = edgeFromPort(graph, action.after.node, action.after.port);
        next = withEdge(next, action.after, id);
        // Если выход уже вёл к шагу — новый блок встаёт между ними.
        if (previous && firstOutput) next = withEdge(next, { node: id, port: firstOutput }, previous.to.node);
      }
      return commit(state, next, `Добавлен блок «${blockName(node)}»`, action.at, {
        selection: { kind: "node", id },
      });
    }
    case "checkpoint":
      return commit(state, graph, action.label, action.at);
    case "moveNode": {
      const nodes = graph.nodes.map((node) =>
        node.id === action.id ? { ...node, position: action.position } : node,
      );
      const next = { ...graph, nodes };
      if (action.record)
        return commit(state, next, `Передвинут блок «${blockName(nodeById(graph, action.id))}»`, action.at);
      return { ...state, graph: next };
    }
    case "connect": {
      if (!nodeById(graph, action.from.node) || !nodeById(graph, action.to)) return state;
      if (!FLOW_BLOCKS[nodeById(graph, action.to)!.type].hasInput) return state;
      if (wouldCreateCycle(graph, action.from.node, action.to))
        return { ...state, notice: { kind: "cycle" } };
      const existing = edgeFromPort(graph, action.from.node, action.from.port);
      if (existing?.to.node === action.to) return state;
      const next = withEdge(graph, action.from, action.to);
      return commit(
        state,
        next,
        `Связь: «${blockName(nodeById(graph, action.from.node))}» → «${blockName(nodeById(graph, action.to))}»`,
        action.at,
      );
    }
    case "disconnect": {
      const edge = edgeFromPort(graph, action.from.node, action.from.port);
      if (!edge) return state;
      return flowEditorReducer(state, { type: "deleteEdge", id: edge.id, at: action.at });
    }
    case "deleteSelection": {
      if (state.selection?.kind === "node")
        return flowEditorReducer(state, { type: "deleteNode", id: state.selection.id, at: action.at });
      if (state.selection?.kind === "edge")
        return flowEditorReducer(state, { type: "deleteEdge", id: state.selection.id, at: action.at });
      return state;
    }
    case "deleteNode": {
      const node = nodeById(graph, action.id);
      // «Начало» удалить нельзя: оно одно и создаётся вместе со сценарием.
      if (!node || node.type === "start") return state;
      const label = `Шаг «${blockName(node)}» удалён`;
      return commit(state, removeNode(graph, action.id), label, action.at, {
        selection: null,
        notice: { kind: "removed", label },
      });
    }
    case "deleteEdge": {
      const edge = graph.edges.find((item) => item.id === action.id);
      if (!edge) return state;
      const label = `Связь «${blockName(nodeById(graph, edge.from.node))}» → «${blockName(nodeById(graph, edge.to.node))}» удалена`;
      return commit(
        state,
        { ...graph, edges: graph.edges.filter((item) => item.id !== action.id) },
        label,
        action.at,
        {
          selection: null,
          notice: { kind: "removed", label },
        },
      );
    }
    case "duplicateNode": {
      const node = nodeById(graph, action.id);
      if (!node || node.type === "start") return state;
      const id = nextId(
        "n",
        graph.nodes.map((item) => item.id),
      );
      const copy: FlowNode = {
        ...node,
        id,
        props: { ...node.props },
        position: { x: node.position.x + 40, y: node.position.y + 40 },
      };
      return commit(
        state,
        { ...graph, nodes: [...graph.nodes, copy] },
        `Скопирован блок «${blockName(node)}»`,
        action.at,
        {
          selection: { kind: "node", id },
        },
      );
    }
    case "updateNode": {
      const node = nodeById(graph, action.id);
      if (!node) return state;
      const updated: FlowNode = {
        ...node,
        props: action.props ? { ...node.props, ...action.props } : node.props,
        ...(action.title !== undefined ? { title: action.title } : {}),
      };
      let next: FlowGraph = {
        ...graph,
        nodes: graph.nodes.map((item) => (item.id === action.id ? updated : item)),
      };
      // Число вариантов уменьшилось — связь пропавшего выхода больше не нужна.
      const ports = new Set(outputsOf(updated).map((output) => output.port));
      next = {
        ...next,
        edges: next.edges.filter((edge) => edge.from.node !== action.id || ports.has(edge.from.port)),
      };
      return commit(state, next, `Изменены настройки «${blockName(updated)}»`, action.at);
    }
    case "updateGraph":
      return commit(state, { ...graph, ...action.patch }, "Изменены свойства сценария", action.at);
    case "updateSettings":
      return commit(
        state,
        { ...graph, settings: { ...graph.settings, ...action.patch } },
        "Изменены свойства сценария",
        action.at,
      );
    case "autoLayout":
      return commit(state, autoLayout(graph), "Схема выровнена", action.at);
    case "replaceGraph":
      return commit(state, action.graph, action.label, action.at, { selection: null });
    case "select":
      return { ...state, selection: action.selection };
    case "dismissNotice":
      return { ...state, notice: null };
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        graph: previous.graph,
        past: state.past.slice(0, -1),
        future: [{ graph: state.graph, label: previous.label, at: previous.at }, ...state.future],
        revision: state.revision + 1,
        selection: keepSelection(state.selection, previous.graph),
        notice: null,
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return state;
      return {
        ...state,
        graph: next.graph,
        past: [...state.past, { graph: state.graph, label: next.label, at: next.at }],
        future: rest,
        revision: state.revision + 1,
        selection: keepSelection(state.selection, next.graph),
        notice: null,
      };
    }
  }
}

function keepSelection(selection: FlowSelection, graph: FlowGraph): FlowSelection {
  if (selection?.kind === "node") return nodeById(graph, selection.id) ? selection : null;
  if (selection?.kind === "edge")
    return graph.edges.some((edge) => edge.id === selection.id) ? selection : null;
  return null;
}
