"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, KeyboardEvent, PointerEvent } from "react";

import {
  FLOW_BLOCKS,
  FLOW_DRAG_MIME,
  graphBounds,
  inputPoint,
  nodeById,
  outputPoint,
  outputsOf,
  predecessors,
  snap,
  stepNumbers,
  successors,
  summarizeNode,
  wireMidpoint,
  wirePath,
} from "@/entities/scenario-flow";
import type {
  FlowBlockDraft,
  FlowDictionaries,
  FlowGraph,
  FlowIssue,
  FlowNodeType,
  FlowPoint,
  FlowSelection,
} from "@/entities/scenario-flow";
import { PfIcon } from "@/shared/ui/platform";

import {
  centerOn,
  clampZoom,
  fitView,
  initialView,
  toWorld,
  ZOOM_SIMPLIFIED,
  ZOOM_STEP,
  zoomAt,
} from "../lib/viewport";
import type { Viewport } from "../lib/viewport";
import { BlockPicker } from "./BlockPicker";
import styles from "./FlowCanvas.module.css";
import { FlowMinimap } from "./FlowMinimap";
import { FlowNodeCard } from "./FlowNodeCard";
import type { NodeMark } from "./FlowNodeCard";

export type FlowPlacement = { after?: { node: string; port: string }; onEdge?: string };

type FlowCanvasProps = {
  graph: FlowGraph;
  dict: FlowDictionaries;
  selection: FlowSelection;
  issues: FlowIssue[];
  /** Отметки пробного прогона: активный, пройденный, проваленный шаг. */
  marks?: Map<string, NodeMark>;
  readOnly?: boolean;
  /** Запрос показать блок (из списка ошибок): поле переносится к нему, фокус — на блок. */
  focusRequest?: { id: string; nonce: number } | null;
  onSelect: (selection: FlowSelection) => void;
  /** Начало перетаскивания блока — один шаг истории на всё перемещение. */
  onMoveStart: (nodeId: string) => void;
  onMove: (nodeId: string, position: FlowPoint, record: boolean) => void;
  onConnect: (from: { node: string; port: string }, to: string) => void;
  onAdd: (draft: FlowBlockDraft, position: FlowPoint, placement?: FlowPlacement) => void;
  onDelete: () => void;
  onAlign: () => void;
  onShowKeys: () => void;
  onOpenInspector: () => void;
};

type Gesture =
  | { kind: "pan"; pointerId: number; start: FlowPoint; origin: Viewport; moved: boolean }
  | { kind: "node"; pointerId: number; id: string; start: FlowPoint; origin: FlowPoint; moved: boolean }
  | { kind: "connect"; pointerId: number; from: { node: string; port: string } };

type Picker = { screen: FlowPoint; world: FlowPoint; placement: FlowPlacement; title: string };

const DRAG_THRESHOLD = 6;
const KEY_STEP = 8;
const KEY_STEP_LARGE = 40;

export function FlowCanvas({
  graph,
  dict,
  selection,
  issues,
  marks,
  readOnly = false,
  focusRequest,
  onSelect,
  onMoveStart,
  onMove,
  onConnect,
  onAdd,
  onDelete,
  onAlign,
  onShowKeys,
  onOpenInspector,
}: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pendingFocus = useRef<string | null>(null);
  const fitted = useRef(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 48, y: 32, zoom: 1 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [connecting, setConnecting] = useState<{
    from: { node: string; port: string };
    point: FlowPoint;
  } | null>(null);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [showMinimap, setShowMinimap] = useState(true);

  const numbers = useMemo(() => stepNumbers(graph), [graph]);
  const ordered = useMemo(
    () => [...graph.nodes].sort((a, b) => (numbers.get(a.id) ?? 0) - (numbers.get(b.id) ?? 0)),
    [graph.nodes, numbers],
  );
  const questionTitles = useMemo(
    () =>
      new Map(
        graph.nodes
          .filter((node) => node.type === "requiredQuestion")
          .map((node) => [node.id, node.title?.trim() || `шаг ${numbers.get(node.id)}`]),
      ),
    [graph.nodes, numbers],
  );
  const issueCount = useMemo(() => {
    const counts = new Map<string, { errors: number; warnings: number }>();
    for (const issue of issues) {
      if (!issue.nodeId) continue;
      const entry = counts.get(issue.nodeId) ?? { errors: 0, warnings: 0 };
      if (issue.level === "error") entry.errors += 1;
      else entry.warnings += 1;
      counts.set(issue.nodeId, entry);
    }
    return counts;
  }, [issues]);
  const selectedNodeId = selection?.kind === "node" ? selection.id : null;
  const selectedEdgeId = selection?.kind === "edge" ? selection.id : null;
  const simplified = viewport.zoom < ZOOM_SIMPLIFIED;

  /* ——— размер поля и первое «Показать всё» ——— */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (fitted.current || !size.width || !size.height) return;
    fitted.current = true;
    setViewport(initialView(graphBounds(graph), size));
  }, [graph, size]);

  /* ——— колесо: Ctrl — масштаб, иначе прокрутка (нативный слушатель, чтобы отменить масштаб страницы) ——— */
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const box = element.getBoundingClientRect();
      if (event.ctrlKey || event.metaKey) {
        const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
        setViewport((current) => zoomAt(current, current.zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1), anchor));
      } else {
        const dx = event.shiftKey ? event.deltaY : event.deltaX;
        const dy = event.shiftKey ? 0 : event.deltaY;
        setViewport((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /* ——— фокус следует за выделением при работе с клавиатуры; показ блока по запросу ——— */
  const reveal = useCallback(
    (id: string) => {
      const node = nodeById(graph, id);
      if (!node || !size.width) return;
      setViewport((current) => {
        const screenX = node.position.x * current.zoom + current.x;
        const screenY = node.position.y * current.zoom + current.y;
        const inside =
          screenX > 0 && screenY > 0 && screenX < size.width - 160 && screenY < size.height - 120;
        return inside
          ? current
          : centerOn(current, { x: node.position.x + 150, y: node.position.y + 78 }, size);
      });
    },
    [graph, size],
  );

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id || id !== selectedNodeId) return;
    pendingFocus.current = null;
    reveal(id);
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-flow-node="${id}"]`)
      ?.focus({ preventScroll: true });
  }, [selectedNodeId, reveal]);

  // Запрос показа обрабатывается один раз: правки графа меняют `reveal`, но не должны снова уводить фокус на блок.
  const handledRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!focusRequest || handledRequest.current === focusRequest.nonce) return;
    handledRequest.current = focusRequest.nonce;
    reveal(focusRequest.id);
    containerRef.current
      ?.querySelector<HTMLElement>(`[data-flow-node="${focusRequest.id}"]`)
      ?.focus({ preventScroll: true });
  }, [focusRequest, reveal]);

  const localPoint = (clientX: number, clientY: number): FlowPoint => {
    const box = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (box?.left ?? 0), y: clientY - (box?.top ?? 0) };
  };

  const selectByKeyboard = (id: string | undefined) => {
    if (!id) return;
    pendingFocus.current = id;
    onSelect({ kind: "node", id });
  };

  /* ——— жесты указателя ——— */
  const capture = (pointerId: number) => containerRef.current?.setPointerCapture?.(pointerId);

  const onBackgroundPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    setPicker(null);
    gesture.current = {
      kind: "pan",
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      origin: viewport,
      moved: false,
    };
    capture(event.pointerId);
  };

  const onNodePointerDown = (event: PointerEvent<HTMLDivElement>, id: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    setPicker(null);
    onSelect({ kind: "node", id });
    if (readOnly) return;
    const node = nodeById(graph, id);
    if (!node) return;
    gesture.current = {
      kind: "node",
      pointerId: event.pointerId,
      id,
      start: { x: event.clientX, y: event.clientY },
      origin: node.position,
      moved: false,
    };
    capture(event.pointerId);
  };

  const onPortPointerDown = (event: PointerEvent<HTMLSpanElement>, nodeId: string, port: string) => {
    if (event.button !== 0 || readOnly) return;
    event.stopPropagation();
    setPicker(null);
    const node = nodeById(graph, nodeId);
    if (!node) return;
    gesture.current = { kind: "connect", pointerId: event.pointerId, from: { node: nodeId, port } };
    setConnecting({ from: { node: nodeId, port }, point: outputPoint(node, port) });
    capture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.kind === "connect") {
      setConnecting((state) =>
        state ? { ...state, point: toWorld(viewport, localPoint(event.clientX, event.clientY)) } : state,
      );
      return;
    }
    const dx = event.clientX - current.start.x;
    const dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (current.kind === "pan") {
      current.moved = true;
      setViewport({ ...current.origin, x: current.origin.x + dx, y: current.origin.y + dy });
      return;
    }
    if (!current.moved) onMoveStart(current.id);
    current.moved = true;
    onMove(
      current.id,
      { x: snap(current.origin.x + dx / viewport.zoom), y: snap(current.origin.y + dy / viewport.zoom) },
      false,
    );
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (current.kind === "pan" && !current.moved) onSelect(null);
    if (current.kind === "connect") {
      setConnecting(null);
      const target = document
        .elementFromPoint?.(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-flow-node]");
      const to = target?.dataset.flowNode;
      if (to && to !== current.from.node) onConnect(current.from, to);
    }
  };

  /* ——— клавиатура ——— */
  const onNodeKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    const node = nodeById(graph, id);
    if (!node) return;
    if (event.key === "Delete" || event.key === "Backspace") {
      if (readOnly) return;
      event.preventDefault();
      onDelete();
      containerRef.current?.focus();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      onOpenInspector();
      return;
    }
    if (event.key === "Escape") {
      onSelect(null);
      containerRef.current?.focus();
      return;
    }
    const arrows: Record<string, FlowPoint> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const direction = arrows[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) {
      if (readOnly) return;
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      onMove(id, { x: node.position.x + direction.x * step, y: node.position.y + direction.y * step }, true);
      return;
    }
    const index = ordered.findIndex((item) => item.id === id);
    if (event.key === "ArrowDown") selectByKeyboard(successors(graph, id)[0]);
    if (event.key === "ArrowUp") selectByKeyboard(predecessors(graph, id)[0]);
    if (event.key === "ArrowLeft") selectByKeyboard(ordered[index - 1]?.id);
    if (event.key === "ArrowRight") selectByKeyboard(ordered[index + 1]?.id);
  };

  const onContainerKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== containerRef.current) return;
    // Выделенная связь (щелчок по линии оставляет фокус на поле): Delete удаляет, Esc снимает выделение.
    if ((event.key === "Delete" || event.key === "Backspace") && selection && !readOnly) {
      event.preventDefault();
      onDelete();
      return;
    }
    if (event.key === "Escape" && selection) {
      onSelect(null);
      return;
    }
    const pan: Record<string, FlowPoint> = {
      ArrowUp: { x: 0, y: 40 },
      ArrowDown: { x: 0, y: -40 },
      ArrowLeft: { x: 40, y: 0 },
      ArrowRight: { x: -40, y: 0 },
    };
    const delta = pan[event.key];
    if (delta) {
      event.preventDefault();
      setViewport((current) => ({ ...current, x: current.x + delta.x, y: current.y + delta.y }));
    }
  };

  /* ——— масштаб и вид ——— */
  const zoomBy = (factor: number) =>
    setViewport((current) =>
      zoomAt(current, clampZoom(current.zoom + factor), { x: size.width / 2, y: size.height / 2 }),
    );
  const fit = () => setViewport(fitView(graphBounds(graph), size));

  /* ——— бросание блока из библиотеки ——— */
  const midpoints = useMemo(
    () =>
      graph.edges.flatMap((edge) => {
        const from = nodeById(graph, edge.from.node);
        const to = nodeById(graph, edge.to.node);
        if (!from || !to) return [];
        const start = outputPoint(from, edge.from.port);
        const end = inputPoint(to);
        return [{ edge, start, end, mid: wireMidpoint(start, end) }];
      }),
    [graph],
  );

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly || !event.dataTransfer.types.includes(FLOW_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (readOnly) return;
    const raw = event.dataTransfer.getData(FLOW_DRAG_MIME);
    if (!raw) return;
    event.preventDefault();
    let draft: FlowBlockDraft;
    try {
      draft = JSON.parse(raw) as FlowBlockDraft;
    } catch {
      return;
    }
    if (!FLOW_BLOCKS[draft.type]) return;
    const world = toWorld(viewport, localPoint(event.clientX, event.clientY));
    const near = midpoints.find(
      (item) => Math.hypot(item.mid.x - world.x, item.mid.y - world.y) < 48 / viewport.zoom,
    );
    onAdd(
      draft,
      { x: snap(world.x - 150), y: snap(world.y - 24) },
      near ? { onEdge: near.edge.id } : undefined,
    );
  };

  const openPicker = (world: FlowPoint, placement: FlowPlacement, title: string) => {
    const screen = { x: world.x * viewport.zoom + viewport.x, y: world.y * viewport.zoom + viewport.y };
    setPicker({
      screen: {
        x: Math.min(Math.max(8, screen.x), Math.max(8, size.width - 300)),
        y: Math.min(Math.max(8, screen.y), Math.max(8, size.height - 420)),
      },
      world,
      placement,
      title,
    });
  };

  const pick = (type: FlowNodeType) => {
    if (!picker) return;
    onAdd({ type }, { x: snap(picker.world.x - 150), y: snap(picker.world.y + 24) }, picker.placement);
    setPicker(null);
  };

  /* ——— отрисовка ——— */
  const firstNodeId = ordered[0]?.id;
  const stepOf = (id: string) => numbers.get(id) ?? 0;

  return (
    <section className={styles.canvasWrap} aria-label="Схема сценария">
      <div
        ref={containerRef}
        className={styles.canvas}
        tabIndex={0}
        aria-label="Поле схемы. Стрелки сдвигают поле; Tab — к блокам."
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          gesture.current = null;
          setConnecting(null);
        }}
        onKeyDown={onContainerKeyDown}
        onScroll={(event) => {
          // Поле не прокручивается: браузер сдвигает его при фокусе на блоке за краем — переводим это в сдвиг вида.
          const element = event.currentTarget;
          const dx = element.scrollLeft;
          const dy = element.scrollTop;
          if (!dx && !dy) return;
          element.scrollLeft = 0;
          element.scrollTop = 0;
          setViewport((current) => ({ ...current, x: current.x - dx, y: current.y - dy }));
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        style={{
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`,
        }}
      >
        <div
          className={styles.world}
          style={
            {
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
              "--zoom": viewport.zoom,
            } as CSSProperties
          }
        >
          <svg className={styles.wires} aria-hidden="true">
            {midpoints.map(({ edge, start, end }) => (
              <g key={edge.id}>
                <path
                  d={wirePath(start, end)}
                  className={edge.id === selectedEdgeId ? styles["wire--selected"] : styles.wire}
                />
                <path
                  d={wirePath(start, end)}
                  className={styles.wire__hit}
                  data-flow-edge={edge.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setPicker(null);
                    onSelect({ kind: "edge", id: edge.id });
                  }}
                />
              </g>
            ))}
            {readOnly
              ? null
              : graph.nodes.flatMap((node) =>
                  outputsOf(node)
                    .filter(
                      (output) =>
                        output.required &&
                        !graph.edges.some(
                          (edge) => edge.from.node === node.id && edge.from.port === output.port,
                        ),
                    )
                    .map((output) => {
                      const from = outputPoint(node, output.port);
                      return (
                        <path
                          key={`${node.id}-${output.port}`}
                          d={`M${from.x},${from.y} L${from.x},${from.y + 22}`}
                          className={styles["wire--open"]}
                        />
                      );
                    }),
                )}
            {connecting
              ? (() => {
                  const fromNode = nodeById(graph, connecting.from.node);
                  return fromNode ? (
                    <path
                      d={wirePath(outputPoint(fromNode, connecting.from.port), connecting.point)}
                      className={styles["wire--draft"]}
                    />
                  ) : null;
                })()
              : null}
          </svg>

          {readOnly
            ? null
            : midpoints
                // «+» только у выделенной связи: иначе на короткой линии он перекрывает её, и щелчок по связи
                // открывал бы меню вставки (найдено e2e). Первый щелчок выделяет связь, второй по «+» — вставка.
                .filter(({ edge }) => edge.id === selectedEdgeId)
                .map(({ edge, mid }) => (
                  <button
                    key={`plus-${edge.id}`}
                    type="button"
                    className={styles.insert}
                    style={{ left: mid.x, top: mid.y }}
                    aria-label={`Вставить шаг между шагами ${stepOf(edge.from.node)} и ${stepOf(edge.to.node)}`}
                    title="Вставить шаг сюда"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openPicker(mid, { onEdge: edge.id }, "Вставить шаг сюда")}
                  >
                    +
                  </button>
                ))}

          {readOnly
            ? null
            : graph.nodes.flatMap((node) =>
                outputsOf(node)
                  .filter(
                    (output) =>
                      output.required &&
                      !graph.edges.some(
                        (edge) => edge.from.node === node.id && edge.from.port === output.port,
                      ),
                  )
                  .map((output) => {
                    const from = outputPoint(node, output.port);
                    return (
                      <button
                        key={`add-${node.id}-${output.port}`}
                        type="button"
                        className={styles.addStep}
                        style={{ left: from.x, top: from.y + 24 }}
                        aria-label={`Добавить шаг после шага ${stepOf(node.id)} для выхода «${output.title}»`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() =>
                          openPicker(
                            { x: from.x, y: from.y + 48 },
                            { after: { node: node.id, port: output.port } },
                            "Добавить шаг",
                          )
                        }
                      >
                        + Добавить шаг
                      </button>
                    );
                  }),
              )}

          {graph.nodes.map((node) => {
            const counts = issueCount.get(node.id);
            const summary = summarizeNode(node, dict, questionTitles);
            const block = FLOW_BLOCKS[node.type];
            const outputs = outputsOf(node).map((output) => {
              const edge = graph.edges.find(
                (item) => item.from.node === node.id && item.from.port === output.port,
              );
              return edge
                ? `выход «${output.title}» ведёт к шагу ${stepOf(edge.to.node)}`
                : `выход «${output.title}» не подключён`;
            });
            const problems = counts
              ? [
                  counts.errors ? `ошибок: ${counts.errors}` : "",
                  counts.warnings ? `предупреждений: ${counts.warnings}` : "",
                ]
                  .filter(Boolean)
                  .join(", ")
              : "";
            return (
              <FlowNodeCard
                key={node.id}
                node={node}
                step={stepOf(node.id)}
                summary={summary}
                selected={node.id === selectedNodeId}
                errors={counts?.errors ?? 0}
                warnings={counts?.warnings ?? 0}
                mark={marks?.get(node.id) ?? null}
                simplified={simplified}
                readOnly={readOnly}
                connectedPorts={
                  new Set(
                    graph.edges.filter((edge) => edge.from.node === node.id).map((edge) => edge.from.port),
                  )
                }
                ariaLabel={[`Шаг ${stepOf(node.id)}, ${block.title}: ${summary}`, ...outputs, problems]
                  .filter(Boolean)
                  .join(". ")}
                tabbable={node.id === selectedNodeId || (!selectedNodeId && node.id === firstNodeId)}
                onPointerDown={(event) => onNodePointerDown(event, node.id)}
                onKeyDown={(event) => onNodeKeyDown(event, node.id)}
                onFocus={() => {
                  if (node.id !== selectedNodeId) onSelect({ kind: "node", id: node.id });
                }}
                onPortPointerDown={(event, port) => onPortPointerDown(event, node.id, port)}
              />
            );
          })}
        </div>

        {picker ? (
          <BlockPicker
            at={picker.screen}
            title={picker.title}
            onPick={pick}
            onClose={() => setPicker(null)}
          />
        ) : null}
      </div>

      <div className={styles.vbar} role="toolbar" aria-label="Вид схемы" aria-orientation="vertical">
        <button
          type="button"
          className={styles.vbar__button}
          onClick={() => zoomBy(ZOOM_STEP)}
          aria-label="Увеличить"
          title="Увеличить (Ctrl + колесо)"
        >
          <PfIcon name="plus" />
        </button>
        <span className={styles.vbar__value} aria-live="polite">
          {Math.round(viewport.zoom * 100)}%
        </span>
        <button
          type="button"
          className={styles.vbar__button}
          onClick={() => zoomBy(-ZOOM_STEP)}
          aria-label="Уменьшить"
          title="Уменьшить (Ctrl + колесо)"
        >
          <PfIcon name="minus" />
        </button>
        <span className={styles.vbar__separator} aria-hidden="true" />
        <button
          type="button"
          className={styles.vbar__button}
          onClick={fit}
          aria-label="Показать всю схему"
          title="Показать всю схему (Ctrl + 0)"
        >
          <PfIcon name="fit" />
        </button>
        {readOnly ? null : (
          <button
            type="button"
            className={styles.vbar__button}
            onClick={onAlign}
            aria-label="Выровнять схему"
            title="Выровнять схему"
          >
            <PfIcon name="align" />
          </button>
        )}
        <button
          type="button"
          className={styles.vbar__button}
          onClick={() => setShowMinimap((value) => !value)}
          aria-pressed={showMinimap}
          aria-label="Мини-карта"
          title={showMinimap ? "Скрыть мини-карту" : "Показать мини-карту"}
        >
          <PfIcon name="map" />
        </button>
        <span className={styles.vbar__separator} aria-hidden="true" />
        <button
          type="button"
          className={styles.vbar__button}
          onClick={onShowKeys}
          aria-label="Клавиши"
          title="Клавиши (?)"
        >
          <PfIcon name="keyboard" />
        </button>
      </div>

      {showMinimap && graph.nodes.length ? (
        <FlowMinimap
          graph={graph}
          viewport={viewport}
          size={size.width ? size : { width: 800, height: 600 }}
          selectedId={selectedNodeId}
          onNavigate={(world) =>
            setViewport((current) =>
              centerOn(current, world, size.width ? size : { width: 800, height: 600 }),
            )
          }
        />
      ) : null}
    </section>
  );
}
