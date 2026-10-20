/* Обход схемы: связи, нумерация шагов, проверка кругов. Чистые функции без React. */
import { FLOW_BLOCKS, outputsOf } from "../model/catalog";
import type { FlowEdge, FlowGraph, FlowNode } from "../model/types";

export function nodeById(graph: FlowGraph, id: string): FlowNode | undefined {
  return graph.nodes.find((node) => node.id === id);
}

/** Связь из конкретного выхода (у выхода не больше одной связи — правило С3). */
export function edgeFromPort(graph: FlowGraph, nodeId: string, port: string): FlowEdge | undefined {
  return graph.edges.find((edge) => edge.from.node === nodeId && edge.from.port === port);
}

/** Следующие блоки в порядке выходов блока; связи из удалённых выходов не учитываются. */
export function successors(graph: FlowGraph, nodeId: string): string[] {
  const node = nodeById(graph, nodeId);
  if (!node) return [];
  return outputsOf(node)
    .map((output) => edgeFromPort(graph, nodeId, output.port)?.to.node)
    .filter((id): id is string => Boolean(id && nodeById(graph, id)));
}

export function predecessors(graph: FlowGraph, nodeId: string): string[] {
  return graph.edges.filter((edge) => edge.to.node === nodeId).map((edge) => edge.from.node);
}

export function startNode(graph: FlowGraph): FlowNode | undefined {
  return graph.nodes.find((node) => node.type === "start");
}

/** Есть ли путь от `fromId` к `toId` по связям. */
export function reaches(graph: FlowGraph, fromId: string, toId: string): boolean {
  const seen = new Set<string>();
  const stack = [fromId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === toId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...successors(graph, current));
  }
  return false;
}

/** Связь «from → to» замкнёт круг, если от `to` уже можно дойти до `from` (правило С5). */
export function wouldCreateCycle(graph: FlowGraph, fromId: string, toId: string): boolean {
  return fromId === toId || reaches(graph, toId, fromId);
}

/** Блоки, образующие круг (первый найденный), или null. */
export function findCycle(graph: FlowGraph): string[] | null {
  const state = new Map<string, "open" | "done">();
  const path: string[] = [];
  const visit = (id: string): string[] | null => {
    state.set(id, "open");
    path.push(id);
    for (const next of successors(graph, id)) {
      if (state.get(next) === "open") return path.slice(path.indexOf(next));
      if (!state.has(next)) {
        const found = visit(next);
        if (found) return found;
      }
    }
    path.pop();
    state.set(id, "done");
    return null;
  };
  for (const node of graph.nodes) {
    if (!state.has(node.id)) {
      const found = visit(node.id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Номера шагов: обход от «Начала» в глубину по порядку выходов (как читается схема сверху вниз), затем
 * недостижимые блоки по порядку создания. Номер — для подписей «Шаг 6» в схеме, свойствах, ошибках и списке.
 */
export function stepNumbers(graph: FlowGraph): Map<string, number> {
  const numbers = new Map<string, number>();
  const start = startNode(graph);
  const visit = (id: string) => {
    if (numbers.has(id)) return;
    numbers.set(id, numbers.size + 1);
    for (const next of successors(graph, id)) visit(next);
  };
  if (start) visit(start.id);
  for (const node of graph.nodes) if (!numbers.has(node.id)) numbers.set(node.id, numbers.size + 1);
  return numbers;
}

/** Топологический порядок; null, если есть круг. */
export function topologicalOrder(graph: FlowGraph): string[] | null {
  const indegree = new Map(graph.nodes.map((node) => [node.id, 0]));
  for (const node of graph.nodes)
    for (const next of successors(graph, node.id)) indegree.set(next, (indegree.get(next) ?? 0) + 1);
  const queue = graph.nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of successors(graph, id)) {
      indegree.set(next, (indegree.get(next) ?? 0) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  return order.length === graph.nodes.length ? order : null;
}

export function isCheckNode(node: FlowNode): boolean {
  return FLOW_BLOCKS[node.type].scoring === "check";
}

/** Короткое имя шага для сообщений: «Шаг 6 · Оповестить службу 104». */
export function stepLabel(graph: FlowGraph, nodeId: string, numbers = stepNumbers(graph)): string {
  const node = nodeById(graph, nodeId);
  if (!node) return "Удалённый шаг";
  return `Шаг ${numbers.get(nodeId) ?? "?"} · ${node.title?.trim() || FLOW_BLOCKS[node.type].title}`;
}
