import { describe, expect, it } from "vitest";

import type { KbArticle } from "@/shared/api";

import { highlightParts, queryStems, searchArticles, stem } from "./search";

const article = (
  id: string,
  title: string,
  group: string,
  signs: string[] = [],
  notification: string[] = [],
): KbArticle => ({
  id,
  title,
  group,
  sections: { signs, notification, clarify: [], ddsDecision: [], typicalErrors: [] },
});

const ARTICLES = [
  article("kb-1", "Пожар в жилом доме", "Пожары", ["Горит балкон", "Дым из окон"], ["Служба 101"]),
  article("kb-2", "Утечка газа", "Газ", ["Запах газа в квартире"], ["Служба 104"]),
  article("kb-3", "ДТП с пострадавшими", "ДТП", ["Есть пострадавшие"], ["Служба 103"]),
  article("kb-4", "Ёлочный пожар", "Пожары"),
];

describe("kb-search", () => {
  it("основа слова: «пожаре», «пожары» → «пожар»; «газа» → «газ»", () => {
    expect(stem("пожаре")).toBe("пожар");
    expect(stem("пожары")).toBe("пожар");
    expect(stem("газа")).toBe("газ");
  });

  it("слова короче 3 букв не ищутся", () => {
    expect(queryStems("в на")).toEqual([]);
    expect(searchArticles(ARTICLES, "на")).toEqual([]);
  });

  it("находит по форме слова в тезисах; все слова запроса обязательны", () => {
    expect(searchArticles(ARTICLES, "балкон пожаре").map((hit) => hit.article.id)).toEqual(["kb-1"]);
    expect(searchArticles(ARTICLES, "запах газа квартира").map((hit) => hit.article.id)).toEqual(["kb-2"]);
    expect(searchArticles(ARTICLES, "газ балкон")).toEqual([]);
  });

  it("совпадение в названии весит больше, чем в тезисе; «ё» = «е»", () => {
    // «горит» есть только в тезисе kb-1, «газ» — в названии и группе kb-2: название и группа весят больше.
    const scores = Object.fromEntries(
      searchArticles(ARTICLES, "пожар").map((hit) => [hit.article.id, hit.score]),
    );
    expect(Object.keys(scores).sort()).toEqual(["kb-1", "kb-4"]);
    expect(searchArticles(ARTICLES, "газ")[0].score).toBeGreaterThan(
      searchArticles(ARTICLES, "горит")[0].score,
    );
    expect(searchArticles(ARTICLES, "елочный").map((hit) => hit.article.id)).toEqual(["kb-4"]);
  });

  it("опечатки не исправляются", () => {
    expect(searchArticles(ARTICLES, "пажар")).toEqual([]);
  });

  it("подсветка выделяет слова с найденной основой", () => {
    expect(highlightParts("Горит балкон, дым", ["балкон"])).toEqual([
      { text: "Горит ", match: false },
      { text: "балкон", match: true },
      { text: ", дым", match: false },
    ]);
  });
});
