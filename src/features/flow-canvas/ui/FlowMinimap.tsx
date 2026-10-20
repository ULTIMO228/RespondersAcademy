"use client";

import { useRef, useState } from "react";
import type { PointerEvent } from "react";

import { FLOW_BLOCKS, graphBounds, nodeSize } from "@/entities/scenario-flow";
import type { FlowGraph, FlowPoint } from "@/entities/scenario-flow";

import { minimapFrame, visibleWorld } from "../lib/viewport";
import type { Viewport } from "../lib/viewport";
import styles from "./FlowCanvas.module.css";

export const MINIMAP_SIZE = { width: 220, height: 150 };

type FlowMinimapProps = {
  graph: FlowGraph;
  viewport: Viewport;
  size: { width: number; height: number };
  selectedId: string | null;
  /** Перейти к мировой точке (щелчок или перетаскивание рамки). */
  onNavigate: (world: FlowPoint) => void;
};

/**
 * Мини-карта поля (решение владельца 2026-10-19): вся схема уменьшенной, рамка — видимая часть. Щелчок или
 * перетаскивание переносит вид. Для клавиатуры дублируется кнопкой «Показать всё» на панели вида.
 */
export function FlowMinimap({ graph, viewport, size, selectedId, onNavigate }: FlowMinimapProps) {
  const ref = useRef<SVGSVGElement>(null);
  const visible = visibleWorld(viewport, size);
  const live = minimapFrame(graphBounds(graph), visible, MINIMAP_SIZE);
  // Пока рамку тянут, масштаб мини-карты заморожен: иначе вид, ушедший за край схемы, расширяет карту,
  // та же точка мыши указывает всё дальше — и вид «улетает» (отзыв владельца 2026-10-20).
  const [dragFrame, setDragFrame] = useState<typeof live | null>(null);
  const frame = dragFrame ?? live;
  const project = (x: number, y: number) => ({
    x: (x - frame.x) * frame.scale,
    y: (y - frame.y) * frame.scale,
  });

  const navigate = (event: PointerEvent<SVGSVGElement>, at: typeof live) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const clamp = (value: number, max: number) => Math.min(max, Math.max(0, value));
    onNavigate({
      x: clamp(event.clientX - box.left, MINIMAP_SIZE.width) / at.scale + at.x,
      y: clamp(event.clientY - box.top, MINIMAP_SIZE.height) / at.scale + at.y,
    });
  };

  const view = project(visible.x, visible.y);
  return (
    <div className={styles.minimap}>
      <svg
        ref={ref}
        width={MINIMAP_SIZE.width}
        height={MINIMAP_SIZE.height}
        role="img"
        aria-label={`Мини-карта: ${graph.nodes.length} блоков. Щелчок переносит вид.`}
        onPointerDown={(event) => {
          event.stopPropagation();
          setDragFrame(live);
          event.currentTarget.setPointerCapture?.(event.pointerId);
          navigate(event, live);
        }}
        onPointerMove={(event) => {
          if (dragFrame) navigate(event, dragFrame);
        }}
        onPointerUp={() => setDragFrame(null)}
        onPointerCancel={() => setDragFrame(null)}
      >
        {graph.nodes.map((node) => {
          const { width, height } = nodeSize(node);
          const at = project(node.position.x, node.position.y);
          return (
            <rect
              key={node.id}
              data-minimap-node={node.id}
              x={at.x}
              y={at.y}
              width={Math.max(3, width * frame.scale)}
              height={Math.max(3, height * frame.scale)}
              rx={2}
              className={node.id === selectedId ? styles["minimap__node--selected"] : styles.minimap__node}
              style={{ fill: `var(--pf-flow-cat-${FLOW_BLOCKS[node.type].group})` }}
            />
          );
        })}
        <rect
          x={view.x}
          y={view.y}
          width={visible.width * frame.scale}
          height={visible.height * frame.scale}
          className={styles.minimap__view}
        />
      </svg>
    </div>
  );
}
