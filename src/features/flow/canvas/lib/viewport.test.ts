import { describe, expect, it } from "vitest";

import {
  centerOn,
  clampZoom,
  fitView,
  initialView,
  minimapFrame,
  toWorld,
  visibleWorld,
  zoomAt,
} from "./viewport";

describe("вид поля", () => {
  it("масштаб ограничен 50–200%", () => {
    expect(clampZoom(0.1)).toBe(0.5);
    expect(clampZoom(3)).toBe(2);
    expect(clampZoom(1.234)).toBe(1.23);
  });

  it("точка под курсором остаётся на месте при масштабировании", () => {
    const before = { x: 100, y: 50, zoom: 1 };
    const anchor = { x: 400, y: 300 };
    const after = zoomAt(before, 1.5, anchor);
    expect(toWorld(after, anchor)).toEqual(toWorld(before, anchor));
    expect(after.zoom).toBe(1.5);
  });

  it("«Показать всё» вписывает схему и не увеличивает больше 100%", () => {
    const fitted = fitView({ x: 0, y: 0, width: 2000, height: 1000 }, { width: 1096, height: 596 });
    expect(fitted.zoom).toBe(0.5);
    const small = fitView({ x: 40, y: 40, width: 300, height: 200 }, { width: 1200, height: 800 });
    expect(small.zoom).toBe(1);
    expect(fitView({ x: 0, y: 0, width: 0, height: 0 }, { width: 0, height: 0 })).toEqual({
      x: 48,
      y: 48,
      zoom: 1,
    });
  });

  it("щелчок по мини-карте ставит точку в центр окна", () => {
    const view = centerOn({ x: 0, y: 0, zoom: 2 }, { x: 100, y: 100 }, { width: 800, height: 600 });
    expect(toWorld(view, { x: 400, y: 300 })).toEqual({ x: 100, y: 100 });
  });

  it("рамка мини-карты охватывает и схему, и видимую часть", () => {
    const visible = visibleWorld({ x: 0, y: 0, zoom: 1 }, { width: 1000, height: 500 });
    const frame = minimapFrame(
      { x: 0, y: 0, width: 2000, height: 2000 },
      visible,
      { width: 200, height: 200 },
      0,
    );
    expect(frame.scale).toBe(0.1);
  });

  it("при открытии длинная схема показывается с начала в 100%, а не мелко целиком", () => {
    const tall = initialView({ x: 40, y: 40, width: 700, height: 2600 }, { width: 1156, height: 700 });
    expect(tall.zoom).toBe(1);
    expect(toWorld(tall, { x: 0, y: 48 }).y).toBe(40);
    const small = initialView({ x: 40, y: 40, width: 700, height: 500 }, { width: 1156, height: 700 });
    expect(small).toEqual(fitView({ x: 40, y: 40, width: 700, height: 500 }, { width: 1156, height: 700 }));
  });
});
