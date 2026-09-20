import { describe, expect, it } from "vitest";

import { EMPTY_SEARCH_VALUES, splitOkrugs, toSearchFilters } from "./searchForm";

describe("форма расширенного поиска → CardSearchFilters (T2.2-13)", () => {
  it("пустая форма — без фильтров", () => {
    expect(toSearchFilters(EMPTY_SEARCH_VALUES)).toEqual({});
  });

  it("округа через запятую, период — московское время формы, строки обрезаются", () => {
    expect(splitOkrugs(" ЮАО,ЦАО , ")).toEqual(["ЮАО", "ЦАО"]);
    expect(
      toSearchFilters({
        ...EMPTY_SEARCH_VALUES,
        incidentType: " пожар ",
        okrugs: "ЮАО, ЦАО",
        cardStatuses: ["registered"],
        periodFrom: "2026-09-17T11:00",
        periodTo: "bad",
        operator: "9999",
      }),
    ).toEqual({
      incidentType: "пожар",
      okrugs: ["ЮАО", "ЦАО"],
      cardStatuses: ["registered"],
      createdFrom: "2026-09-17T11:00:00+03:00",
      operator: "9999",
    });
  });
});
