import armCardsJson from "@mocks/fixtures/arm-cards.json";
import { describe, expect, it } from "vitest";

import type { ArmCardFixtureContract, CardSearchFilters } from "@/shared/api";

import { filterCards, getCardArmNumber, getCardRegion, normalizeSearchText } from "./filters";

const cards = armCardsJson.cards as ArmCardFixtureContract[];

function numbers(filters: CardSearchFilters): number[] {
  return filterCards(cards, filters).map((card) => card.number);
}

describe("filterCards — матрица полей на 12 фикстурах arm-cards.json", () => {
  it.each<[string, CardSearchFilters, number[]]>([
    ["тип происшествия (подстрока finalType/klass)", { incidentType: "дтп" }, [36814850, 36814857]],
    ["признак 2-го уровня", { signs: ["Кухня"] }, [36814851]],
    ["признаки — OR внутри поля", { signs: ["Лифт", "Дерево"] }, [881412, 36814852]],
    ["АРМ (множ.)", { arms: ["7", "9"] }, [881412, 36814853]],
    ["адрес формализованный", { address: "чертановская улица" }, [881412, 36814853]],
    ["округа — OR", { okrugs: ["ЦАО", "ТАО"] }, [36814845, 36814854, 36814855, 36814857]],
    ["район — одно значение", { raion: "зюзино" }, [36814851, 36814859]],
    ["описательный адрес", { descriptiveAddress: "ЭТАЖ" }, [36814845, 36814851, 36814852]],
    ["служба по notificationList", { services: ["svc-103"] }, [36814850, 36814855, 36814857]],
    ["описание", { description: "задымл" }, [36814859]],
    ["заявитель — ФИО", { applicant: "Гусев" }, [36814850]],
    ["заявитель — АОН (цифры)", { applicant: "925 301-22" }, [36814850]],
    ["источник", { sources: ["СОДЧ (МВД)"] }, [36814856]],
    ["оператор", { operator: "сомова" }, [36814851]],
    ["номер карточки", { cardNumber: "881412" }, [881412]],
    ["статусы карточки", { cardStatuses: ["notNotified", "completed"] }, [881412, 36814858]],
    [
      "период createdAt (границы включительно)",
      { createdFrom: "2026-09-17T11:31:02+03:00", createdTo: "2026-09-17T11:38:26+03:00" },
      [36814853, 36814854, 36814855],
    ],
  ])("%s", (_title, filters, expected) => {
    expect(numbers(filters)).toEqual(expected);
  });

  it("регион — все московские карточки, включая адрес без «Россия»", () => {
    expect(numbers({ region: "москва" })).toHaveLength(cards.length);
    expect(getCardRegion(cards.find((card) => card.number === 36814856) as ArmCardFixtureContract)).toBe(
      "Москва",
    );
    expect(numbers({ region: "Калуга" })).toEqual([]);
  });

  it("комбинация: тип + округ + период (AND между полями)", () => {
    const filters = { incidentType: "ДТП", okrugs: ["ЮАО"], createdFrom: "2026-09-17T11:00:00+03:00" };
    expect(numbers(filters)).toEqual([36814850]);
  });

  it("признак 3-го уровня дерева честно не применяется (ограничение ПОВ-112, памятка стр. 35–40)", () => {
    expect(cards.some((card) => card.what.signs[2] === "открытое пламя")).toBe(true);
    expect(numbers({ signs: ["открытое пламя"] })).toEqual([]);
  });

  it("канал связи: без resolveChannel не находит ничего, с резолвером — фильтрует по OR", () => {
    expect(numbers({ channels: ["МТС"] })).toEqual([]);
    const resolveChannel = (card: ArmCardFixtureContract) => (card.createdByVis ? "ЕДЦ" : "МГТС-112");
    expect(filterCards(cards, { channels: ["ЕДЦ"] }, { resolveChannel }).map((card) => card.number)).toEqual([
      36814856,
    ]);
  });

  it("регистронезависимость кириллицы и «ё»", () => {
    expect(numbers({ applicant: "СЕМЕНОВА" })).toEqual([36814855]);
    expect(normalizeSearchText("  Ёлка   ВО  дворе ")).toBe("елка во дворе");
  });

  it("пустые фильтры → исходный список", () => {
    expect(filterCards(cards, {})).toEqual(cards);
    const blank = { incidentType: "  ", okrugs: [], signs: [""], cardStatuses: [], createdFrom: "" };
    expect(filterCards(cards, blank)).toEqual(cards);
  });

  it("не мутирует вход", () => {
    const snapshot = JSON.stringify(cards);
    filterCards(cards, { okrugs: ["ЮАО"] });
    expect(JSON.stringify(cards)).toBe(snapshot);
  });

  it("номер АРМ разбирается из registeredBy", () => {
    expect(getCardArmNumber(cards[0])).toBe("7");
    expect(getCardArmNumber(cards.find((card) => card.createdByVis) as ArmCardFixtureContract)).toBeNull();
  });
});
