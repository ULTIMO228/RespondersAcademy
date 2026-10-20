/* Вид поля: сдвиг и масштаб (design-concept.md §6, §11). Экранная точка = мировая × zoom + сдвиг. */
import type { FlowBounds, FlowPoint } from "@/entities/scenario-flow";

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
/** Ниже этого масштаба блоки показываются упрощённо — только тип и номер. */
export const ZOOM_SIMPLIFIED = 0.75;

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

export function toWorld(viewport: Viewport, screen: FlowPoint): FlowPoint {
  return { x: (screen.x - viewport.x) / viewport.zoom, y: (screen.y - viewport.y) / viewport.zoom };
}

/** Масштаб вокруг экранной точки: точка под курсором остаётся на месте. */
export function zoomAt(viewport: Viewport, nextZoom: number, anchor: FlowPoint): Viewport {
  const zoom = clampZoom(nextZoom);
  const world = toWorld(viewport, anchor);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}

/** «Показать всё»: схема целиком в окне с полями; масштаб не больше 100%, чтобы текст не раздувался. */
export function fitView(bounds: FlowBounds, size: { width: number; height: number }, padding = 48): Viewport {
  if (!bounds.width || !bounds.height || !size.width || !size.height)
    return { x: padding, y: padding, zoom: 1 };
  const zoom = clampZoom(
    Math.min(1, (size.width - padding * 2) / bounds.width, (size.height - padding * 2) / bounds.height),
  );
  return {
    zoom,
    x: (size.width - bounds.width * zoom) / 2 - bounds.x * zoom,
    y: Math.max(padding, (size.height - bounds.height * zoom) / 2) - bounds.y * zoom,
  };
}

/**
 * Вид при открытии: вся схема, если она помещается без упрощения блоков; иначе — её начало в масштабе 100%,
 * чтобы текст на блоках читался сразу (остальное — прокруткой, мини-картой или «Показать всё»).
 */
export function initialView(
  bounds: FlowBounds,
  size: { width: number; height: number },
  padding = 48,
): Viewport {
  const fitted = fitView(bounds, size, padding);
  if (fitted.zoom >= ZOOM_SIMPLIFIED) return fitted;
  return {
    zoom: 1,
    x: (size.width - Math.min(bounds.width, size.width)) / 2 - bounds.x,
    y: padding - bounds.y,
  };
}

/** Поставить мировую точку в центр окна (щелчок по мини-карте). */
export function centerOn(
  viewport: Viewport,
  world: FlowPoint,
  size: { width: number; height: number },
): Viewport {
  return {
    ...viewport,
    x: size.width / 2 - world.x * viewport.zoom,
    y: size.height / 2 - world.y * viewport.zoom,
  };
}

/** Видимая часть мира — рамка на мини-карте. */
export function visibleWorld(viewport: Viewport, size: { width: number; height: number }): FlowBounds {
  const topLeft = toWorld(viewport, { x: 0, y: 0 });
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: size.width / viewport.zoom,
    height: size.height / viewport.zoom,
  };
}

/** Масштаб мини-карты: схема и видимая часть целиком в рамке `box`. */
export function minimapFrame(
  content: FlowBounds,
  visible: FlowBounds,
  box: { width: number; height: number },
  padding = 40,
) {
  const x = Math.min(content.x, visible.x) - padding;
  const y = Math.min(content.y, visible.y) - padding;
  const right = Math.max(content.x + content.width, visible.x + visible.width) + padding;
  const bottom = Math.max(content.y + content.height, visible.y + visible.height) + padding;
  const scale = Math.min(box.width / (right - x), box.height / (bottom - y));
  return { x, y, scale };
}
