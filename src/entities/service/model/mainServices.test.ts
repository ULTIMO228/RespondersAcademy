import { describe, expect, it } from "vitest";

import { getMainServiceIds } from "./mainServices";
import { getStatusTitle } from "./statusHistory";

describe("getMainServiceIds", () => {
  it("маппит коды классификатора на службы справочника", () => {
    expect(getMainServiceIds("MCHS")).toEqual(["svc-101"]);
    expect(getMainServiceIds("METRO, MZD")).toEqual(["svc-metro"]);
    expect(getMainServiceIds("")).toEqual([]);
  });
});

describe("getStatusTitle", () => {
  it("возвращает название статуса или код", () => {
    expect(getStatusTitle("added", [{ status: "added", title: "Добавлена" }])).toBe("Добавлена");
    expect(getStatusTitle("x", [])).toBe("x");
  });
});
