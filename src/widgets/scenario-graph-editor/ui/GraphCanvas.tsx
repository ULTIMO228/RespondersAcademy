"use client";

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from "react";

import type { GraphNode } from "@/shared/api";

import { NODE_HEIGHT, NODE_WIDTH } from "../lib/layout";
import { findDanglingEdges, listEdges, NODE_KIND_LABEL } from "../lib/model";
import type { EdgeSlot, EditorGraph, GraphEdge } from "../lib/model";
import { KIND_ICON } from "../lib/workflow";
import { Btn } from "./controls";

import styles from "./GraphCanvas.module.css";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5];
const KEY_STEP = 10;
const KEY_STEP_BIG = 50;
const STUB_LENGTH = 70;
const LABEL_CHAR_WIDTH = 9;

type GraphCanvasProps = {
  graph: EditorGraph;
  size: { width: number; height: number };
  selectedId: string | null;
  errorNodeIds: ReadonlySet<string>;
  unusedIds: ReadonlySet<string>;
  readOnly: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, y: number) => void;
  onConnect: (from: string, slot: EdgeSlot, target: string) => void;
  onDeleteRequest: (id: string) => void;
};

type Drag =
  | { kind: "move"; id: string; startX: number; startY: number; originX: number; originY: number }
  | { kind: "connect"; from: string; slot: EdgeSlot; x: number; y: number };

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function nodeCaption(node: GraphNode): string {
  return node.title || node.label || node.outcome || node.id;
}

function hexagon(width: number, height: number): string {
  const cut = 26;
  return [`${cut},0`, `${width - cut},0`, `${width},${height / 2}`, `${width - cut},${height}`, `${cut},${height}`, `0,${height / 2}`].join(" ");
}

function portPoint(graph: EditorGraph, edge: { from: string; index: number; count: number }) {
  const origin = graph.layout[edge.from] ?? { x: 0, y: 0 };
  return { x: origin.x + NODE_WIDTH, y: origin.y + (NODE_HEIGHT * (edge.index + 1)) / (edge.count + 1) };
}

function edgeGeometry(graph: EditorGraph, edge: GraphEdge) {
  const from = portPoint(graph, edge);
  const target = graph.layout[edge.to];
  if (!target) return null;
  const to = { x: target.x, y: target.y + NODE_HEIGHT / 2 };
  const reach = Math.max(60, Math.abs(to.x - from.x) / 2);
  const c1 = { x: from.x + reach, y: from.y };
  const c2 = { x: to.x - reach, y: to.y };
  return {
    path: `M ${from.x} ${from.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${to.x} ${to.y}`,
    mid: { x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8, y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8 },
  };
}

/** Холст графа на собственном SVG: блоки, соединения с подписями веток, перетаскивание и клавиатура. */
export function GraphCanvas({
  graph,
  size,
  selectedId,
  errorNodeIds,
  unusedIds,
  readOnly,
  onSelect,
  onMove,
  onConnect,
  onDeleteRequest,
}: GraphCanvasProps) {
  const [zoom, setZoom] = useState(1);
  const [drag, setDrag] = useState<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const edges = useMemo(() => listEdges(graph), [graph]);
  const dangling = useMemo(() => new Set(findDanglingEdges(graph).map((edge) => edge.key)), [graph]);

  const toModel = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: (event.clientX - (rect?.left ?? 0)) / zoom, y: (event.clientY - (rect?.top ?? 0)) / zoom };
  };

  const startMove = (event: ReactPointerEvent, node: GraphNode) => {
    onSelect(node.id);
    if (readOnly) return;
    const origin = graph.layout[node.id] ?? { x: 0, y: 0 };
    const point = toModel(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ kind: "move", id: node.id, startX: point.x, startY: point.y, originX: origin.x, originY: origin.y });
  };

  const startConnect = (event: ReactPointerEvent, edge: GraphEdge) => {
    event.stopPropagation();
    if (readOnly) return;
    const point = toModel(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    setDrag({ kind: "connect", from: edge.from, slot: edge.slot, x: point.x, y: point.y });
  };

  const handleMove = (event: ReactPointerEvent) => {
    if (!drag) return;
    const point = toModel(event);
    if (drag.kind === "move") {
      onMove(drag.id, drag.originX + point.x - drag.startX, drag.originY + point.y - drag.startY);
    } else {
      setDrag({ ...drag, x: point.x, y: point.y });
    }
  };

  const handleUp = (event: ReactPointerEvent) => {
    if (drag?.kind === "connect") {
      const point = toModel(event);
      const target = graph.nodes.find((node) => {
        const origin = graph.layout[node.id];
        return (
          origin &&
          point.x >= origin.x &&
          point.x <= origin.x + NODE_WIDTH &&
          point.y >= origin.y &&
          point.y <= origin.y + NODE_HEIGHT
        );
      });
      if (target) onConnect(drag.from, drag.slot, target.id);
    }
    svgRef.current?.releasePointerCapture?.(event.pointerId);
    setDrag(null);
  };

  const handleKey = (event: ReactKeyboardEvent, node: GraphNode) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node.id);
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (!readOnly) onDeleteRequest(node.id);
      return;
    }
    const delta = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    onSelect(node.id);
    if (readOnly) return;
    const step = event.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    const origin = graph.layout[node.id] ?? { x: 0, y: 0 };
    onMove(node.id, origin.x + delta[0] * step, origin.y + delta[1] * step);
  };

  const changeZoom = (direction: -1 | 1) => {
    const index = ZOOM_STEPS.indexOf(zoom);
    const next = ZOOM_STEPS[Math.max(0, Math.min(ZOOM_STEPS.length - 1, index + direction))];
    setZoom(next);
  };

  const connectingLine = drag?.kind === "connect" ? drag : null;
  const connectingEdge = connectingLine ? edges.find((edge) => edge.from === connectingLine.from && JSON.stringify(edge.slot) === JSON.stringify(connectingLine.slot)) : null;

  return (
    <div className={styles.canvas}>
      <div className={styles.canvas__bar}>
        <Btn onClick={() => changeZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label="Уменьшить масштаб">
          −
        </Btn>
        <span className={styles.canvas__zoom} aria-live="polite">
          {Math.round(zoom * 100)}%
        </span>
        <Btn onClick={() => changeZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label="Увеличить масштаб">
          +
        </Btn>
        <Btn onClick={() => setZoom(1)}>100%</Btn>
      </div>
      <div className={styles.canvas__scroll}>
        <svg
          ref={svgRef}
          className={styles.svg}
          width={size.width * zoom}
          height={size.height * zoom}
          viewBox={`0 0 ${size.width} ${size.height}`}
          role="group"
          aria-label={`Холст графа сценария, блоков: ${graph.nodes.length}`}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => setDrag(null)}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) onSelect(null);
          }}
        >
          <defs>
            <marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={styles.arrow} />
            </marker>
          </defs>
          {edges.map((edge) => {
            const geometry = edgeGeometry(graph, edge);
            const isDangling = dangling.has(edge.key);
            if (!geometry || isDangling) {
              const from = portPoint(graph, edge);
              return (
                <g key={edge.key} className={styles.edge__dangling}>
                  <line x1={from.x} y1={from.y} x2={from.x + STUB_LENGTH} y2={from.y} strokeDasharray="6 5" />
                  <text x={from.x + STUB_LENGTH + 6} y={from.y + 5}>
                    {edge.label ? `${edge.label}: ` : ""}нет цели
                  </text>
                </g>
              );
            }
            const labelWidth = edge.label.length * LABEL_CHAR_WIDTH + 14;
            return (
              <g key={edge.key} className={styles.edge}>
                <path d={geometry.path} markerEnd="url(#graph-arrow)" fill="none" />
                {edge.label ? (
                  <g>
                    <rect x={geometry.mid.x - labelWidth / 2} y={geometry.mid.y - 14} width={labelWidth} height={26} rx={4} className={styles.edge__labelBg} />
                    <text x={geometry.mid.x} y={geometry.mid.y + 5} textAnchor="middle" className={styles.edge__label}>
                      {edge.label}
                    </text>
                  </g>
                ) : null}
              </g>
            );
          })}
          {connectingLine && connectingEdge ? (
            <line
              className={styles.rubber}
              x1={portPoint(graph, connectingEdge).x}
              y1={portPoint(graph, connectingEdge).y}
              x2={connectingLine.x}
              y2={connectingLine.y}
            />
          ) : null}
          {graph.nodes.map((node) => {
            const origin = graph.layout[node.id] ?? { x: 0, y: 0 };
            const isStart = graph.start === node.id;
            const hasError = errorNodeIds.has(node.id);
            const isUnused = unusedIds.has(node.id);
            const nodeEdges = edges.filter((edge) => edge.from === node.id);
            const classes = [
              styles.node,
              styles[`node--${node.type}`],
              selectedId === node.id ? styles["node--selected"] : "",
              hasError ? styles["node--error"] : "",
            ]
              .filter(Boolean)
              .join(" ");
            const flags = [isStart ? "стартовый" : "", hasError ? "есть ошибки" : "", isUnused ? "не используется" : ""].filter(Boolean);
            return (
              <g key={node.id} transform={`translate(${origin.x} ${origin.y})`}>
                <g
                  className={classes}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === node.id}
                  aria-label={`${NODE_KIND_LABEL[node.type]} «${nodeCaption(node)}», идентификатор ${node.id}${flags.length ? `, ${flags.join(", ")}` : ""}`}
                  data-node-id={node.id}
                  onPointerDown={(event) => startMove(event, node)}
                  onKeyDown={(event) => handleKey(event, node)}
                >
                  {node.type === "condition" ? (
                    <polygon className={styles.node__shape} points={hexagon(NODE_WIDTH, NODE_HEIGHT)} />
                  ) : (
                    <rect
                      className={styles.node__shape}
                      width={NODE_WIDTH}
                      height={NODE_HEIGHT}
                      rx={node.type === "end" ? NODE_HEIGHT / 2 : 10}
                    />
                  )}
                  <text x={NODE_WIDTH / 2} y={30} textAnchor="middle" className={styles.node__kind}>
                    {KIND_ICON[node.type]} {NODE_KIND_LABEL[node.type]}
                    {isStart ? " · старт" : ""}
                  </text>
                  <text x={NODE_WIDTH / 2} y={56} textAnchor="middle" className={styles.node__title}>
                    {truncate(nodeCaption(node), 22)}
                  </text>
                  <text x={NODE_WIDTH / 2} y={80} textAnchor="middle" className={styles.node__id}>
                    {node.id}
                  </text>
                </g>
                {hasError || isUnused ? (
                  <text x={4} y={-8} className={hasError ? styles.flag__error : styles.flag__unused}>
                    {hasError ? "⚠ Ошибка в блоке" : "Не используется"}
                  </text>
                ) : null}
                {nodeEdges.map((edge) => {
                  const port = portPoint(graph, edge);
                  return (
                    <g
                      key={edge.key}
                      className={`${styles.port} ${readOnly ? styles["port--off"] : ""}`}
                      transform={`translate(${port.x - origin.x} ${port.y - origin.y})`}
                      onPointerDown={(event) => startConnect(event, edge)}
                      aria-hidden="true"
                    >
                      <circle r={16} className={styles.port__hit} />
                      <circle r={8} className={styles.port__dot} />
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
