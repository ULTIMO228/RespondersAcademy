/*
 * «Выровнять схему» (design-concept.md §6): блоки раскладываются по уровням сверху вниз — уровень блока равен самому
 * длинному пути от «Начала»; внутри уровня порядок — по номерам шагов. Недостижимые блоки ставятся отдельной
 * строкой внизу. Работает и со схемой с кругом (круг разрывается по первому посещению).
 */
import type { FlowGraph } from "../model/types";
import { FLOW_NODE_HEIGHT, FLOW_NODE_WIDTH, nodeSize } from "./geometry";
import { startNode, stepNumbers, successors } from "./graph";

export const LAYOUT_GAP_X = 48;
export const LAYOUT_GAP_Y = 72;
const ORIGIN = { x: 40, y: 40 };

export function autoLayout(graph: FlowGraph): FlowGraph {
  const level = new Map<string, number>();
  const start = startNode(graph);
  if (start) {
    // Самый длинный путь по графу без кругов: обход в глубину с отсечкой по уже открытым блокам.
    const open = new Set<string>();
    const visit = (id: string, depth: number) => {
      if (open.has(id) || (level.get(id) ?? -1) >= depth) return;
      level.set(id, depth);
      open.add(id);
      for (const next of successors(graph, id)) visit(next, depth + 1);
      open.delete(id);
    };
    visit(start.id, 0);
  }
  const maxLevel = Math.max(-1, ...level.values());
  for (const node of graph.nodes) if (!level.has(node.id)) level.set(node.id, maxLevel + 1);

  const numbers = stepNumbers(graph);
  const rows = new Map<number, string[]>();
  for (const node of graph.nodes) {
    const row = level.get(node.id)!;
    rows.set(row, [...(rows.get(row) ?? []), node.id]);
  }
  const widest = Math.max(1, ...[...rows.values()].map((ids) => ids.length));
  const rowWidth = (count: number) => count * FLOW_NODE_WIDTH + (count - 1) * LAYOUT_GAP_X;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [row, ids] of rows) {
    ids.sort((a, b) => (numbers.get(a) ?? 0) - (numbers.get(b) ?? 0));
    const offset = (rowWidth(widest) - rowWidth(ids.length)) / 2;
    ids.forEach((id, index) => {
      const node = graph.nodes.find((item) => item.id === id)!;
      const { width } = nodeSize(node);
      positions.set(id, {
        x: ORIGIN.x + offset + index * (FLOW_NODE_WIDTH + LAYOUT_GAP_X) + (FLOW_NODE_WIDTH - width) / 2,
        y: ORIGIN.y + row * (FLOW_NODE_HEIGHT + LAYOUT_GAP_Y),
      });
    });
  }
  return {
    ...graph,
    nodes: graph.nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position })),
  };
}
