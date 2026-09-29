import { describe, expect, it } from "vitest";

import type { KbArticle } from "@/shared/api";

import { HOTKEY_SECTIONS } from "../config/hotkeys";
import { HELP_MATERIALS } from "../config/materials";
import { filterArticles, filterHotkeys, filterMaterials, filterNumbers, matchesQuery } from "./search";

const article = (id: string, group: string, title: string): KbArticle => ({
  id,
  group,
  title,
  sections: { signs: [], notification: [], clarify: [], ddsDecision: [], typicalErrors: [] },
});

const ARTICLES = [
  article("kb-1", "Пожары", "Пожар в жилом доме"),
  article("kb-2", "Газ", "Запах бытового газа"),
];

describe("поиск по справочнику", () => {
  it("регистр не важен, пустой запрос подходит всему", () => {
    expect(matchesQuery("Запах ГАЗА", "газа")).toBe(true);
    expect(matchesQuery("Запах газа", "  ")).toBe(true);
    expect(matchesQuery("Запах газа", "пожар")).toBe(false);
  });

  it("статьи: по названию и группе, с фильтром группы", () => {
    expect(filterArticles(ARTICLES, "пожар", "").map((item) => item.id)).toEqual(["kb-1"]);
    expect(filterArticles(ARTICLES, "", "Газ").map((item) => item.id)).toEqual(["kb-2"]);
    expect(filterArticles(ARTICLES, "газ", "Пожары")).toEqual([]);
  });

  it("служебные номера — по номеру и названию", () => {
    const numbers = [
      { number: "301", title: "Руководитель дежурной смены ДДС" },
      { number: "101", title: "Служба 101" },
    ];
    expect(filterNumbers(numbers, "301")).toHaveLength(1);
    expect(filterNumbers(numbers, "смены")).toHaveLength(1);
  });

  it("памятки и горячие клавиши: строки фильтруются, пустые разделы скрываются", () => {
    expect(filterMaterials(HELP_MATERIALS, "классификатор").map((item) => item.id)).toEqual(["classifier"]);
    const found = filterHotkeys(HOTKEY_SECTIONS, "Shift+F2");
    expect(found).toHaveLength(1);
    expect(found[0].rows.map((row) => row.keys)).toEqual(["Shift+F2"]);
    expect(filterHotkeys(HOTKEY_SECTIONS, "несуществующая комбинация")).toEqual([]);
    expect(filterHotkeys(HOTKEY_SECTIONS, "")).toHaveLength(HOTKEY_SECTIONS.length);
  });
});
