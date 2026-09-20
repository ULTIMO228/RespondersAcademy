import { describe, expect, it } from "vitest";

import { FIXTURES, REFERENCE } from "./journalFakeApi.testing";
import { buildSearchOptions, buildSignTree } from "./searchOptions";

describe("значения расширенного поиска", () => {
  it("АРМ — из «Опер. N, АРМ M» карточек, службы — id + краткое имя, статусы — код + подпись", () => {
    const options = buildSearchOptions(REFERENCE, FIXTURES);
    expect(options.arms[0]).toEqual({ value: "2", label: "АРМ 002" });
    expect(options.services[0]).toEqual({ value: "svc-101", label: "Служба 101" });
    expect(options.cardStatuses[0]).toEqual({ value: "registered", label: "Зарегистрирована" });
  });

  it("дерево признаков 1–3-го уровня без повторов", () => {
    const tree = buildSignTree(FIXTURES);
    const house = tree.find((node) => node.label === "жилой дом");
    expect(house?.children.map((node) => node.label)).toEqual(["квартира"]);
    expect(house?.children[0].children.map((node) => node.label)).toEqual(["открытое пламя", "дым"]);
  });
});
