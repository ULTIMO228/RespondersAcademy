/*
 * Модель редактора графа: рабочее состояние (`EditorGraph`) допускает незаполненные поля (пустые цели соединений,
 * пустые подписи), а `toGraph` собирает из него чистый `scenario-graph/1` без пустых строк и висящих layout-узлов.
 * Все функции чистые: исходное состояние не мутируется.
 */
import { SCENARIO_GRAPH_SCHEMA } from "@/shared/api";
import type {
  GraphBranch,
  GraphDecoy,
  GraphLayoutPoint,
  GraphNode,
  GraphNodeType,
  GraphPredicate,
  GraphScoring,
  ScenarioGraph,
} from "@/shared/api";

export type EditorGraph = {
  start: string;
  nodes: GraphNode[];
  decoys: GraphDecoy[];
  scoring: GraphScoring;
  layout: Record<string, GraphLayoutPoint>;
};

/** Слот исходящего соединения: единственный `next` шага, ветка условия по номеру или `else`. */
export type EdgeSlot = { kind: "next" } | { kind: "branch"; index: number } | { kind: "else" };

export type GraphEdge = {
  key: string;
  from: string;
  /** Пустая строка — соединение не задано. */
  to: string;
  slot: EdgeSlot;
  label: string;
  /** Порядковый номер исходящего соединения узла и их общее число (для разнесения портов). */
  index: number;
  count: number;
};

export const NODE_KIND_LABEL: Record<GraphNodeType, string> = {
  action: "Шаг",
  condition: "Условие",
  end: "Завершение",
};

const ID_PREFIX: Record<GraphNodeType, string> = { action: "step", condition: "cond", end: "end" };
export const DEFAULT_ELSE_NAME = "Иначе";
const COORD_LIMIT = 10_000;

export function emptyEditorGraph(): EditorGraph {
  return { start: "", nodes: [], decoys: [], scoring: {}, layout: {} };
}

export function fromGraph(graph: ScenarioGraph): EditorGraph {
  const copy = structuredClone(graph);
  return {
    start: copy.start ?? "",
    nodes: copy.nodes ?? [],
    decoys: copy.decoys ?? [],
    scoring: copy.scoring ?? {},
    layout: copy.layout ?? {},
  };
}

function text(value: string | undefined): string | undefined {
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function cleanNode(node: GraphNode): GraphNode {
  const base: GraphNode = { id: node.id, type: node.type };
  const title = text(node.title);
  if (title) base.title = title;
  if (node.type === "action") {
    const prompt = text(node.prompt);
    const label = text(node.label);
    if (prompt) base.prompt = prompt;
    base.action = node.action ?? "";
    if (label) base.label = label;
    if (node.sets && Object.keys(node.sets).length > 0) base.sets = { ...node.sets };
    if (node.input && node.input.fact.trim() !== "") base.input = structuredClone(node.input);
    if (node.next) base.next = node.next;
    if (node.maxVisits !== undefined) base.maxVisits = node.maxVisits;
  } else if (node.type === "condition") {
    base.branches = structuredClone(node.branches ?? []);
    base.else = { name: node.else?.name ?? DEFAULT_ELSE_NAME, next: node.else?.next ?? "" };
    if (node.maxVisits !== undefined) base.maxVisits = node.maxVisits;
  } else {
    const prompt = text(node.prompt);
    if (prompt) base.prompt = prompt;
    base.outcome = node.outcome ?? "";
    if (node.score !== undefined) base.score = node.score;
    if (node.passed !== undefined) base.passed = node.passed;
  }
  return base;
}

/** Состояние редактора → граф для сервера: layout сохраняется только для существующих узлов. */
export function toGraph(state: EditorGraph): ScenarioGraph {
  const ids = new Set(state.nodes.map((node) => node.id));
  const layout: Record<string, GraphLayoutPoint> = {};
  for (const [id, point] of Object.entries(state.layout)) {
    if (!ids.has(id)) continue;
    layout[id] = {
      x: Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(point.x))),
      y: Math.max(-COORD_LIMIT, Math.min(COORD_LIMIT, Math.round(point.y))),
    };
  }
  const scoring: GraphScoring = {};
  if (state.scoring.wrongActionPenalty !== undefined) {
    scoring.wrongActionPenalty = state.scoring.wrongActionPenalty;
  }
  if (state.scoring.passScore !== undefined) scoring.passScore = state.scoring.passScore;
  const graph: ScenarioGraph = {
    schemaVersion: SCENARIO_GRAPH_SCHEMA,
    start: state.start,
    nodes: structuredClone(state.nodes.map(cleanNode)),
  };
  const decoys = state.decoys.filter((decoy) => decoy.action.trim() !== "" && decoy.label.trim() !== "");
  if (decoys.length > 0) graph.decoys = decoys.map((decoy) => ({ ...decoy }));
  if (Object.keys(scoring).length > 0) graph.scoring = scoring;
  if (Object.keys(layout).length > 0) graph.layout = layout;
  return graph;
}

/** Сериализация для сравнения «есть несохранённые изменения». */
export function graphSignature(state: EditorGraph): string {
  return JSON.stringify(toGraph(state));
}

export function findNode(state: EditorGraph, id: string | null | undefined): GraphNode | undefined {
  return id ? state.nodes.find((node) => node.id === id) : undefined;
}

export function createNodeId(nodes: GraphNode[], kind: GraphNodeType): string {
  const used = new Set(nodes.map((node) => node.id));
  for (let n = 1; ; n += 1) {
    const candidate = `${ID_PREFIX[kind]}${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

function defaultNode(state: EditorGraph, kind: GraphNodeType, id: string): GraphNode {
  if (kind === "action") {
    const used = new Set(state.nodes.map((node) => node.action));
    let n = 1;
    while (used.has(`action${n}`)) n += 1;
    return { id, type: "action", title: "Новый шаг", action: `action${n}`, label: "Новое действие" };
  }
  if (kind === "condition") {
    return {
      id,
      type: "condition",
      title: "Новое условие",
      branches: [{ name: "Ветка 1", when: { fact: "", op: "eq", value: "" }, next: "" }],
      else: { name: DEFAULT_ELSE_NAME, next: "" },
    };
  }
  return { id, type: "end", title: "Завершение", outcome: "completed", score: 100, passed: true };
}

/** Добавляет блок; первый блок графа становится стартовым. Возвращает новый граф и id блока. */
export function addNode(
  state: EditorGraph,
  kind: GraphNodeType,
  position?: GraphLayoutPoint,
): { graph: EditorGraph; id: string } {
  const id = createNodeId(state.nodes, kind);
  const node = defaultNode(state, kind, id);
  const bottom = Object.values(state.layout).reduce((max, point) => Math.max(max, point.y), 0);
  const point = position ?? { x: 60, y: state.nodes.length === 0 ? 60 : bottom + 150 };
  return {
    id,
    graph: {
      ...state,
      start: state.start || id,
      nodes: [...state.nodes, node],
      layout: { ...state.layout, [id]: point },
    },
  };
}

function retarget(node: GraphNode, mapTarget: (target: string) => string): GraphNode {
  const next: GraphNode = { ...node };
  if (node.next !== undefined) next.next = mapTarget(node.next);
  if (node.branches) next.branches = node.branches.map((branch) => ({ ...branch, next: mapTarget(branch.next) }));
  if (node.else) next.else = { ...node.else, next: mapTarget(node.else.next) };
  if (next.next === "") delete next.next;
  return next;
}

/** Удаляет блок и очищает ссылки на него: next убирается, цели веток/else обнуляются, start переносится. */
export function removeNode(state: EditorGraph, id: string): EditorGraph {
  const nodes = state.nodes
    .filter((node) => node.id !== id)
    .map((node) => retarget(node, (target) => (target === id ? "" : target)));
  const layout = { ...state.layout };
  delete layout[id];
  return { ...state, start: state.start === id ? (nodes[0]?.id ?? "") : state.start, nodes, layout };
}

const NODE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export type RenameResult = { ok: true; graph: EditorGraph } | { ok: false; error: string };

/** Переименовывает id блока и обновляет start, ссылки и layout. */
export function renameNode(state: EditorGraph, oldId: string, newId: string): RenameResult {
  const next = newId.trim();
  if (next === oldId) return { ok: true, graph: state };
  if (!NODE_ID_PATTERN.test(next)) {
    return { ok: false, error: "Идентификатор: латиница, цифры, «-» и «_», до 64 символов" };
  }
  if (state.nodes.some((node) => node.id === next)) {
    return { ok: false, error: `Блок с идентификатором «${next}» уже есть` };
  }
  const nodes = state.nodes.map((node) => {
    const moved = retarget(node, (target) => (target === oldId ? next : target));
    return node.id === oldId ? { ...moved, id: next } : moved;
  });
  const layout: Record<string, GraphLayoutPoint> = {};
  for (const [id, point] of Object.entries(state.layout)) layout[id === oldId ? next : id] = point;
  return { ok: true, graph: { ...state, start: state.start === oldId ? next : state.start, nodes, layout } };
}

export function updateNode(state: EditorGraph, id: string, patch: Partial<GraphNode>): EditorGraph {
  return { ...state, nodes: state.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node)) };
}

/** Задаёт цель соединения; пустая строка снимает соединение. */
export function setConnection(state: EditorGraph, from: string, slot: EdgeSlot, target: string): EditorGraph {
  return {
    ...state,
    nodes: state.nodes.map((node) => {
      if (node.id !== from) return node;
      if (slot.kind === "next") {
        const copy = { ...node };
        if (target) copy.next = target;
        else delete copy.next;
        return copy;
      }
      if (slot.kind === "else") return { ...node, else: { name: node.else?.name ?? DEFAULT_ELSE_NAME, next: target } };
      return {
        ...node,
        branches: (node.branches ?? []).map((branch, index) =>
          index === slot.index ? { ...branch, next: target } : branch,
        ),
      };
    }),
  };
}

export function addBranch(state: EditorGraph, id: string): EditorGraph {
  const node = findNode(state, id);
  if (!node || node.type !== "condition") return state;
  const names = new Set([...(node.branches ?? []).map((branch) => branch.name), node.else?.name]);
  let n = (node.branches?.length ?? 0) + 1;
  while (names.has(`Ветка ${n}`)) n += 1;
  const branch: GraphBranch = { name: `Ветка ${n}`, when: { fact: "", op: "eq", value: "" }, next: "" };
  return updateNode(state, id, { branches: [...(node.branches ?? []), branch] });
}

/** Удаляет ветку; последнюю ветку условия удалить нельзя (серверу нужна хотя бы одна). */
export function removeBranch(state: EditorGraph, id: string, index: number): EditorGraph {
  const node = findNode(state, id);
  if (!node || node.type !== "condition" || (node.branches?.length ?? 0) <= 1) return state;
  return updateNode(state, id, { branches: (node.branches ?? []).filter((_, i) => i !== index) });
}

export function updateBranch(
  state: EditorGraph,
  id: string,
  index: number,
  patch: Partial<{ name: string; when: GraphPredicate }>,
): EditorGraph {
  const node = findNode(state, id);
  if (!node || node.type !== "condition") return state;
  return updateNode(state, id, {
    branches: (node.branches ?? []).map((branch, i) => (i === index ? { ...branch, ...patch } : branch)),
  });
}

export function moveNode(state: EditorGraph, id: string, point: GraphLayoutPoint): EditorGraph {
  if (!findNode(state, id)) return state;
  return { ...state, layout: { ...state.layout, [id]: point } };
}

/** Все исходящие соединения графа (в том числе не заданные: `to === ""`). */
export function listEdges(state: EditorGraph): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const node of state.nodes) {
    if (node.type === "action") {
      edges.push({ key: `${node.id}:next`, from: node.id, to: node.next ?? "", slot: { kind: "next" }, label: "", index: 0, count: 1 });
    } else if (node.type === "condition") {
      const branches = node.branches ?? [];
      const count = branches.length + 1;
      branches.forEach((branch, index) =>
        edges.push({ key: `${node.id}:b${index}`, from: node.id, to: branch.next, slot: { kind: "branch", index }, label: branch.name, index, count }),
      );
      edges.push({ key: `${node.id}:else`, from: node.id, to: node.else?.next ?? "", slot: { kind: "else" }, label: node.else?.name ?? DEFAULT_ELSE_NAME, index: branches.length, count });
    }
  }
  return edges;
}

/** Соединения, у которых цель не задана или такого блока нет. */
export function findDanglingEdges(state: EditorGraph): GraphEdge[] {
  const ids = new Set(state.nodes.map((node) => node.id));
  return listEdges(state).filter((edge) => edge.to === "" || !ids.has(edge.to));
}

/** Блоки, до которых не дойти от start (подсвечиваются как «не используется»). */
export function findUnusedNodes(state: EditorGraph): string[] {
  const reached = new Set<string>();
  const queue = state.nodes.some((node) => node.id === state.start) ? [state.start] : [];
  const edges = listEdges(state);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const edge of edges) if (edge.from === id && edge.to && !reached.has(edge.to)) queue.push(edge.to);
  }
  return state.nodes.filter((node) => !reached.has(node.id)).map((node) => node.id);
}

export type LocalCheck = { message: string; nodeId: string | null };

/** Дешёвые проверки без сервера: нет start, висящие ссылки. Полная проверка — на сервере. */
export function localChecks(state: EditorGraph): LocalCheck[] {
  const checks: LocalCheck[] = [];
  if (state.nodes.length === 0) return [{ message: "В графе нет ни одного блока", nodeId: null }];
  if (!state.start) checks.push({ message: "Не выбран стартовый блок", nodeId: null });
  else if (!findNode(state, state.start)) {
    checks.push({ message: `Стартовый блок «${state.start}» не существует`, nodeId: null });
  }
  const ids = new Set(state.nodes.map((node) => node.id));
  for (const edge of findDanglingEdges(state)) {
    const where = edge.label ? `ветка «${edge.label}»` : "переход";
    checks.push({
      message:
        edge.to === ""
          ? `Блок «${edge.from}»: ${where} не ведёт ни к одному блоку`
          : `Блок «${edge.from}»: ${where} ведёт к несуществующему блоку «${edge.to}»`,
      nodeId: ids.has(edge.from) ? edge.from : null,
    });
  }
  return checks;
}
