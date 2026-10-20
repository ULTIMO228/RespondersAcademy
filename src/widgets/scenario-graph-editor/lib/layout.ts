/* Авто-раскладка графа слоями от стартового блока и размеры холста. Чистые функции. */
import type { GraphLayoutPoint } from "@/shared/api";

import { listEdges } from "./model";
import type { EditorGraph } from "./model";

export const NODE_WIDTH = 250;
export const NODE_HEIGHT = 100;
const COLUMN_GAP = 330;
const ROW_GAP = 150;
const MARGIN = 60;

/** Слой каждого достижимого блока (BFS от start); недостижимые получают слои после последнего. */
export function computeLayers(state: EditorGraph): Map<string, number> {
  const layers = new Map<string, number>();
  const ids = new Set(state.nodes.map((node) => node.id));
  const edges = listEdges(state).filter((edge) => ids.has(edge.to));
  const queue: string[] = ids.has(state.start) ? [state.start] : [];
  if (queue.length > 0) layers.set(state.start, 0);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const edge of edges) {
      if (edge.from !== id || layers.has(edge.to)) continue;
      layers.set(edge.to, (layers.get(id) ?? 0) + 1);
      queue.push(edge.to);
    }
  }
  let layer = Math.max(-1, ...layers.values()) + 1;
  for (const node of state.nodes) {
    if (layers.has(node.id)) continue;
    layers.set(node.id, layer);
    const reachable = [node.id];
    while (reachable.length > 0) {
      const id = reachable.shift() as string;
      for (const edge of edges) {
        if (edge.from !== id || layers.has(edge.to)) continue;
        layers.set(edge.to, (layers.get(id) ?? layer) + 1);
        reachable.push(edge.to);
      }
    }
    layer = Math.max(...layers.values()) + 1;
  }
  return layers;
}

/** Координаты по слоям: слой — колонка слева направо, внутри слоя — порядок узлов графа. */
export function autoLayout(state: EditorGraph): Record<string, GraphLayoutPoint> {
  const layers = computeLayers(state);
  const rows = new Map<number, number>();
  const layout: Record<string, GraphLayoutPoint> = {};
  for (const node of state.nodes) {
    const layer = layers.get(node.id) ?? 0;
    const row = rows.get(layer) ?? 0;
    rows.set(layer, row + 1);
    layout[node.id] = { x: MARGIN + layer * COLUMN_GAP, y: MARGIN + row * ROW_GAP };
  }
  return layout;
}

/** Достраивает layout только для блоков без координат; заданные вручную позиции не трогает. */
export function ensureLayout(state: EditorGraph): EditorGraph {
  if (state.nodes.every((node) => state.layout[node.id])) return state;
  const computed = autoLayout(state);
  const layout = { ...state.layout };
  for (const node of state.nodes) layout[node.id] ??= computed[node.id];
  return { ...state, layout };
}

export function canvasSize(state: EditorGraph): { width: number; height: number } {
  const points = state.nodes.map((node) => state.layout[node.id]).filter(Boolean);
  const width = Math.max(0, ...points.map((point) => point.x)) + NODE_WIDTH + MARGIN * 2;
  const height = Math.max(0, ...points.map((point) => point.y)) + NODE_HEIGHT + MARGIN * 2;
  return { width: Math.max(width, 720), height: Math.max(height, 420) };
}
