import { describe, expect, it } from "vitest";

import { sampleGraph } from "./fixtures";
import { autoLayout, canvasSize, computeLayers, ensureLayout, NODE_WIDTH } from "./layout";
import { fromGraph, moveNode } from "./model";

describe("авто-раскладка", () => {
  it("раскладывает слоями от start: колонки растут слева направо", () => {
    const state = fromGraph(sampleGraph());
    const layers = computeLayers(state);
    expect([...layers.entries()]).toEqual([
      ["n1", 0],
      ["n2", 1],
      ["n3", 2],
      ["n4", 3],
      ["n5", 3],
    ]);
    const layout = autoLayout(state);
    expect(layout.n2.x).toBeGreaterThan(layout.n1.x);
    expect(layout.n4.x).toBe(layout.n5.x);
    expect(layout.n5.y).toBeGreaterThan(layout.n4.y);
  });

  it("недостижимые блоки получают отдельные слои и не теряются", () => {
    const state = fromGraph(sampleGraph());
    state.nodes.push({ id: "lonely", type: "end", outcome: "x" });
    const layers = computeLayers(state);
    expect(layers.get("lonely")).toBeGreaterThan(3);
  });

  it("ensureLayout достраивает только отсутствующие координаты", () => {
    const state = fromGraph(sampleGraph());
    const filled = ensureLayout(state);
    expect(filled.layout.n1).toEqual({ x: 80, y: 60 });
    expect(Object.keys(filled.layout).sort()).toEqual(["n1", "n2", "n3", "n4", "n5"]);
    expect(ensureLayout(filled)).toBe(filled);
  });

  it("не падает на графе без start", () => {
    const state = { ...fromGraph(sampleGraph()), start: "", layout: {} };
    expect(Object.keys(autoLayout(state))).toHaveLength(5);
  });

  it("размер холста охватывает самый дальний блок", () => {
    const state = moveNode(ensureLayout(fromGraph(sampleGraph())), "n5", { x: 2000, y: 900 });
    const size = canvasSize(state);
    expect(size.width).toBeGreaterThanOrEqual(2000 + NODE_WIDTH);
    expect(size.height).toBeGreaterThan(900);
  });
});
