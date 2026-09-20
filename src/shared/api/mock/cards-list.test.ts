// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ArmCardFixture, CardSearchFilters } from "../types";
import { listCards, readCardSearchFilters, resolveCardChannel } from "./cards-list";
import type { CardSearch } from "./cards-list";
import { readArmFixtures } from "./readers";
import { MockApiError } from "./respond";

function filtersOf(query: string): CardSearchFilters {
  return readCardSearchFilters(new URLSearchParams(query));
}

describe("readCardSearchFilters — маппинг query → CardSearchFilters", () => {
  it.each([
    "incidentType",
    "address",
    "raion",
    "descriptiveAddress",
    "region",
    "description",
    "applicant",
    "operator",
    "cardNumber",
  ] as const)("скалярное поле %s: ключ = имя поля, значение обрезается", (key) => {
    expect(filtersOf(`${key}=${encodeURIComponent("  значение ")}`)).toEqual({ [key]: "значение" });
  });

  it.each([
    ["signs", "sign"],
    ["arms", "arm"],
    ["okrugs", "okrug"],
    ["services", "service"],
    ["channels", "channel"],
    ["sources", "source"],
  ] as const)("множественное поле %s: повторные ключи %s + синоним-имя поля", (field, key) => {
    expect(filtersOf(`${key}=a&${key}=b&${field}=c`)).toEqual({ [field]: ["a", "b", "c"] });
  });

  it("CSV не разбирается: запятая — часть значения", () => {
    expect(filtersOf("okrug=ЮАО,ЦАО")).toEqual({ okrugs: ["ЮАО,ЦАО"] });
  });

  it("cardStatuses: status / cardStatus / cardStatuses — синонимы; мусор → 400", () => {
    expect(filtersOf("status=registered&cardStatus=completed&cardStatuses=refusal")).toEqual({
      cardStatuses: ["registered", "completed", "refusal"],
    });
    expect(() => filtersOf("cardStatus=nope")).toThrow(MockApiError);
  });

  it("период: ISO принимается, мусор → 400; пустые параметры не применяются", () => {
    expect(filtersOf("createdFrom=2026-09-17T11:00:00%2B03:00&createdTo=")).toEqual({
      createdFrom: "2026-09-17T11:00:00+03:00",
    });
    expect(() => filtersOf("createdTo=вчера")).toThrow(/createdTo/);
    expect(filtersOf("address=&okrug=")).toEqual({});
  });
});

describe("listCards — инъекция поиска", () => {
  it("функция поиска получает источник, фильтры и resolveChannel; пагинация — после неё", () => {
    const calls: Array<{ size: number; filters: CardSearchFilters }> = [];
    const search: CardSearch = (cards, filters, options) => {
      calls.push({ size: cards.length, filters });
      return cards.filter((card) => options.resolveChannel?.(card) !== null).slice(0, 3);
    };
    const page = listCards(new URLSearchParams("dataset=fixtures&okrug=ЮАО&perPage=2"), search);
    expect(calls).toEqual([{ size: readArmFixtures().length, filters: { okrugs: ["ЮАО"] } }]);
    expect(page).toMatchObject({ total: 3, page: 1, perPage: 2 });
    expect(page.items).toHaveLength(2);
  });

  it("resolveCardChannel: есть АОН → «телефония (АОН)», нет — null", () => {
    const [card] = readArmFixtures();
    expect(resolveCardChannel(card)).toBe("телефония (АОН)");
    const silent: ArmCardFixture = { ...card, phones: { ...card.phones, aon: " " } };
    expect(resolveCardChannel(silent)).toBeNull();
  });
});
