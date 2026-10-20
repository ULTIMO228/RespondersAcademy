import { describe, expect, it } from "vitest";

import {
  changeLeafOp,
  emptyLeaf,
  leafValueFromText,
  leafValueToText,
  parseScalar,
  predicateKind,
  unwrapPredicate,
  wrapPredicate,
} from "./predicate";

describe("предикаты", () => {
  it("оборачивает лист в all/any/not и снимает обёртку", () => {
    const leaf = { fact: "category", op: "eq", value: "tree" } as const;
    expect(predicateKind(leaf)).toBe("leaf");
    const all = wrapPredicate(leaf, "all");
    expect(predicateKind(all)).toBe("all");
    expect(all).toEqual({ all: [leaf, emptyLeaf()] });
    expect(predicateKind(wrapPredicate(leaf, "any"))).toBe("any");
    expect(unwrapPredicate(all)).toEqual(leaf);
    expect(unwrapPredicate(wrapPredicate(leaf, "not"))).toEqual(leaf);
    expect(unwrapPredicate(leaf)).toBe(leaf);
  });

  it("разбирает скаляры и списки значений", () => {
    expect(parseScalar("true")).toBe(true);
    expect(parseScalar("42")).toBe(42);
    expect(parseScalar("tree")).toBe("tree");
    expect(parseScalar("")).toBe("");
    expect(leafValueFromText("in", "a, 2, true,")).toEqual(["a", 2, true]);
    expect(leafValueFromText("exists", "x")).toBeUndefined();
    expect(leafValueToText({ fact: "f", op: "in", value: ["a", 2] })).toBe("a, 2");
  });

  it("смена операции приводит значение к нужной форме", () => {
    expect(changeLeafOp({ fact: "f", op: "eq", value: "a" }, "in")).toEqual({ fact: "f", op: "in", value: ["a"] });
    expect(changeLeafOp({ fact: "f", op: "in", value: ["a", "b"] }, "eq")).toEqual({ fact: "f", op: "eq", value: "a" });
    expect(changeLeafOp({ fact: "f", op: "eq", value: "a" }, "exists")).toEqual({ fact: "f", op: "exists" });
  });
});
