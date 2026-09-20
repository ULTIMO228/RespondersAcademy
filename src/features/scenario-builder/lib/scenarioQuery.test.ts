import { describe, expect, it } from "vitest";

import { buildQuery } from "@/shared/api";

import { buildScenarioQuery, EMPTY_FILTER, isEmptyFilter } from "./scenarioQuery";

describe("buildScenarioQuery (T3.1-04)", () => {
  it("пустой фильтр — пустая query-строка", () => {
    expect(buildScenarioQuery(EMPTY_FILTER)).toEqual({});
    expect(buildQuery(buildScenarioQuery(EMPTY_FILTER))).toBe("");
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
  });

  it("категории — повторным ключом group, остальные фильтры — своими ключами", () => {
    const query = buildScenarioQuery({
      categories: ["пожар в жилом доме", "пожар на улице"],
      difficulty: "4",
      source: "generated",
      status: "approved",
    });
    expect(query).toEqual({
      group: ["пожар в жилом доме", "пожар на улице"],
      difficulty: [4],
      source: "generated",
      validationStatus: "approved",
    });
    const search = new URLSearchParams(buildQuery(query));
    expect(search.getAll("group")).toEqual(["пожар в жилом доме", "пожар на улице"]);
    expect(search.get("difficulty")).toBe("4");
    expect(search.get("validationStatus")).toBe("approved");
  });

  it("сброс фильтров возвращает пустую query", () => {
    const filter = { categories: ["Дерево"], difficulty: "2", source: "template", status: "draft" };
    expect(isEmptyFilter(filter)).toBe(false);
    expect(buildScenarioQuery(EMPTY_FILTER)).toEqual({});
  });
});
