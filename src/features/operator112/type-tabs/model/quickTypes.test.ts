import { describe, expect, it } from "vitest";

import { TEST_ENTRIES } from "./fixtures";
import { matchGroups } from "./quickTypes";

describe("matchGroups", () => {
  it("находит группы по словам без учёта регистра", () => {
    expect(matchGroups(TEST_ENTRIES, "ПОЖАР")).toEqual(["пожар в жилом доме", "пожар на улице"]);
    expect(matchGroups(TEST_ENTRIES, "пожар улице")).toEqual(["пожар на улице"]);
  });

  it("пустой запрос и запрос без совпадений — пусто", () => {
    expect(matchGroups(TEST_ENTRIES, "  ")).toEqual([]);
    expect(matchGroups(TEST_ENTRIES, "наводнение")).toEqual([]);
  });
});
