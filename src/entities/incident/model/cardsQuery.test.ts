import { describe, expect, it } from "vitest";

import { hasActiveFilters, toCardsQuery } from "./cardsQuery";

describe("toCardsQuery — запрос GET /api/mock/cards", () => {
  it("множественные поля → повторные ключи в единственном числе, пустые значения не передаются", () => {
    const query = toCardsQuery({
      filters: {
        incidentType: " пожар ",
        okrugs: ["ЮАО", "ЦАО"],
        services: ["svc-101"],
        cardStatuses: ["registered"],
        address: "  ",
        arms: [],
        createdFrom: "2026-09-17T11:00:00+03:00",
      },
      view: "all",
      dataset: "all",
      page: 2,
      perPage: 10,
    });
    expect(query).toEqual({
      incidentType: "пожар",
      okrug: ["ЮАО", "ЦАО"],
      service: ["svc-101"],
      cardStatus: ["registered"],
      createdFrom: "2026-09-17T11:00:00+03:00",
      view: undefined,
      dataset: "all",
      sort: "-createdAt",
      page: 2,
      perPage: 10,
    });
  });

  it("вид ленты empty/sms передаётся параметром view", () => {
    expect(
      toCardsQuery({ filters: {}, view: "sms", dataset: "fixtures", page: 1, perPage: 20 }),
    ).toMatchObject({
      view: "sms",
      dataset: "fixtures",
    });
  });

  it("hasActiveFilters: пустые строки и списки не считаются", () => {
    expect(hasActiveFilters({ address: " ", okrugs: [""] })).toBe(false);
    expect(hasActiveFilters({ cardNumber: "881" })).toBe(true);
  });
});
