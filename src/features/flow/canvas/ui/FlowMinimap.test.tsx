import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { createDemoGraph } from "@/entities/scenario-flow";
import type { FlowPoint } from "@/entities/scenario-flow";

import { centerOn } from "../lib/viewport";
import type { Viewport } from "../lib/viewport";
import { FlowMinimap } from "./FlowMinimap";

const SIZE = { width: 1200, height: 800 };

/** Как на поле: каждый переход сразу двигает вид, и мини-карта перерисовывается с новым видом. */
function Harness({ onNavigate }: { onNavigate: (world: FlowPoint) => void }) {
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  return (
    <FlowMinimap
      graph={createDemoGraph()}
      viewport={viewport}
      size={SIZE}
      selectedId={null}
      onNavigate={(world) => {
        onNavigate(world);
        setViewport((current) => centerOn(current, world, SIZE));
      }}
    />
  );
}

function stubBox(element: Element) {
  element.getBoundingClientRect = () =>
    ({ left: 100, top: 100, width: 220, height: 150, right: 320, bottom: 250, x: 100, y: 100 }) as DOMRect;
}

describe("FlowMinimap", () => {
  it("рамка, протянутая к левому краю, не «улетает»: одна и та же точка мыши — одна и та же точка схемы", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const map = screen.getByRole("img", { name: /Мини-карта/ });
    stubBox(map);
    fireEvent.pointerDown(map, { clientX: 200, clientY: 170, pointerId: 1 });
    for (let i = 0; i < 5; i += 1) fireEvent.pointerMove(map, { clientX: 102, clientY: 170, pointerId: 1 });
    const targets = onNavigate.mock.calls.slice(1).map(([world]) => Math.round((world as FlowPoint).x));
    expect(new Set(targets).size).toBe(1);
  });

  it("за краем мини-карты точка не уходит дальше края", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const map = screen.getByRole("img", { name: /Мини-карта/ });
    stubBox(map);
    fireEvent.pointerDown(map, { clientX: 200, clientY: 170, pointerId: 1 });
    fireEvent.pointerMove(map, { clientX: 100, clientY: 170, pointerId: 1 });
    const atEdge = (onNavigate.mock.calls.at(-1)![0] as FlowPoint).x;
    fireEvent.pointerMove(map, { clientX: -500, clientY: 170, pointerId: 1 });
    expect((onNavigate.mock.calls.at(-1)![0] as FlowPoint).x).toBeCloseTo(atEdge);
  });

  it("после отпускания кнопки мыши движение без нажатия вид не двигает", () => {
    const onNavigate = vi.fn();
    render(<Harness onNavigate={onNavigate} />);
    const map = screen.getByRole("img", { name: /Мини-карта/ });
    stubBox(map);
    fireEvent.pointerDown(map, { clientX: 200, clientY: 170, pointerId: 1 });
    fireEvent.pointerUp(map, { pointerId: 1 });
    fireEvent.pointerMove(map, { clientX: 120, clientY: 170, pointerId: 1 });
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
