import { describe, expect, it } from "vitest";

import { buildFlowDictionaries } from "./buildDictionaries";

describe("buildFlowDictionaries — справочники из моков", () => {
  const dict = buildFlowDictionaries();

  it("банк ситуаций: 96 карточек билетов с подписью «Билет N.M»", () => {
    expect(dict.cards).toHaveLength(96);
    expect(dict.cards.find((card) => card.value === "c-010")).toMatchObject({
      label: "Билет 4.1",
      address: expect.stringContaining("ул. Грина, 11"),
    });
  });

  it("статусы ДДС сохраняют допустимые переходы справочника", () => {
    expect(dict.ddsStatuses.find((status) => status.value === "accepted")).toMatchObject({
      label: "Принята",
      next: ["responseStarted"],
    });
  });

  it("службы и учебные номера — для оповещения (112) и звонков (ДДС)", () => {
    expect(dict.services.map((service) => service.value)).toEqual(
      expect.arrayContaining(["svc-101", "svc-102", "svc-103", "svc-104"]),
    );
    expect(dict.phoneNumbers.find((item) => item.value === "104")?.label).toContain("104 —");
  });

  it("признаки ЕКП — без пустых и без повторов", () => {
    const values = dict.signs.map((sign) => sign.value);
    expect(values.length).toBeGreaterThan(10);
    expect(new Set(values).size).toBe(values.length);
    expect(values.every((value) => value.trim().length > 0)).toBe(true);
  });
});
