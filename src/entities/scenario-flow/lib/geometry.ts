/* Размеры блоков и точки подключения на поле (design-concept.md §6): поток сверху вниз. */
import { outputsOf } from "../model/catalog";
import type { FlowGraph, FlowNode, FlowPoint } from "../model/types";

export const FLOW_NODE_WIDTH = 300;
export const FLOW_NODE_HEIGHT = 156;
export const FLOW_PILL_WIDTH = 200;
export const FLOW_PILL_HEIGHT = 52;
/** Шаг привязки к сетке поля. */
export const FLOW_GRID = 8;

export function isPill(node: Pick<FlowNode, "type">): boolean {
  return node.type === "start" || node.type === "end";
}

export function nodeSize(node: Pick<FlowNode, "type">): { width: number; height: number } {
  return isPill(node)
    ? { width: FLOW_PILL_WIDTH, height: FLOW_PILL_HEIGHT }
    : { width: FLOW_NODE_WIDTH, height: FLOW_NODE_HEIGHT };
}

/** Вход — сверху по центру. */
export function inputPoint(node: FlowNode): FlowPoint {
  const { width } = nodeSize(node);
  return { x: node.position.x + width / 2, y: node.position.y };
}

/** Выход — снизу, по центру своей подписи на полосе выходов. */
export function outputPoint(node: FlowNode, port: string): FlowPoint {
  const { width, height } = nodeSize(node);
  const outputs = outputsOf(node);
  const index = Math.max(
    0,
    outputs.findIndex((output) => output.port === port),
  );
  const slot = width / Math.max(outputs.length, 1);
  return { x: node.position.x + slot * index + slot / 2, y: node.position.y + height };
}

/** Плавная кривая сверху вниз (как связи Unreal, но вертикальная). */
export function wirePath(from: FlowPoint, to: FlowPoint): string {
  const bend = Math.max(40, Math.abs(to.y - from.y) / 2);
  return `M${from.x},${from.y} C${from.x},${from.y + bend} ${to.x},${to.y - bend} ${to.x},${to.y}`;
}

/** Середина кривой (t = 0,5) — место кнопки «Вставить шаг сюда». */
export function wireMidpoint(from: FlowPoint, to: FlowPoint): FlowPoint {
  const bend = Math.max(40, Math.abs(to.y - from.y) / 2);
  const c1 = { x: from.x, y: from.y + bend };
  const c2 = { x: to.x, y: to.y - bend };
  return {
    x: 0.125 * from.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * to.x,
    y: 0.125 * from.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * to.y,
  };
}

export function snap(value: number): number {
  return Math.round(value / FLOW_GRID) * FLOW_GRID;
}

export interface FlowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Границы всех блоков; у пустой схемы — нулевая рамка в начале координат. */
export function graphBounds(graph: FlowGraph): FlowBounds {
  if (!graph.nodes.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of graph.nodes) {
    const { width, height } = nodeSize(node);
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + width);
    maxY = Math.max(maxY, node.position.y + height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
