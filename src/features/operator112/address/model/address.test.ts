import { describe, expect, it } from "vitest";

import {
  EMPTY_ADDRESS,
  clearAddress,
  composeFormal,
  isMoscow,
  pickStreet,
  typeStreet,
  withFields,
} from "./address";

const STREET = { id: 7, name: "улица Грина", type: "улица", okrug: "ЮАО", raion: "Чертаново Южное" };

describe("адрес режима 112", () => {
  it("formal собирается из улицы, дома и описательного адреса", () => {
    expect(composeFormal({ street: "улица Грина", house: "11", descriptive: "рядом с библиотекой" })).toBe(
      "Москва, улица Грина, дом 11, рядом с библиотекой",
    );
    expect(composeFormal({ street: "", house: "", descriptive: "" })).toBe("");
  });

  it("выбор из справочника: улица, округ, район и источник directory", () => {
    const next = pickStreet(withFields(EMPTY_ADDRESS, { house: "11" }), STREET);
    expect(next).toMatchObject({
      street: "улица Грина",
      okrug: "ЮАО",
      raion: "Чертаново Южное",
      source: "directory",
    });
    expect(next.formal).toBe("Москва, улица Грина, дом 11");
  });

  it("выбор без округа/района не затирает уже введённые", () => {
    const base = withFields(EMPTY_ADDRESS, { okrug: "ЦАО" });
    expect(pickStreet(base, { id: 1, name: "Тверская", type: "улица" }).okrug).toBe("ЦАО");
  });

  it("правка текста после выбора переводит источник в manual; тот же текст (без правки) — сохраняет directory", () => {
    const picked = pickStreet(EMPTY_ADDRESS, STREET);
    expect(typeStreet(picked, "улица Гринa", STREET.name).source).toBe("manual");
    expect(typeStreet(picked, STREET.name, STREET.name).source).toBe("directory");
    expect(typeStreet(EMPTY_ADDRESS, "Тверская", null).source).toBe("manual");
  });

  it("умолчания: Россия / Москва / Москва; clearAddress их возвращает", () => {
    expect(EMPTY_ADDRESS).toMatchObject({ country: "Россия", subject: "Москва", locality: "Москва" });
    const dirty = withFields(EMPTY_ADDRESS, { subject: "Тверская область", street: "Ленина", flat: "5" });
    expect(clearAddress()).toEqual(EMPTY_ADDRESS);
    expect(dirty.flat).toBe("5");
  });

  it("другой субъект: справочник недоступен, источник manual, formal по населённому пункту", () => {
    const picked = pickStreet(EMPTY_ADDRESS, STREET);
    expect(picked.source).toBe("directory");
    const moved = withFields(picked, { subject: "Тверская область", locality: "Тверь" });
    expect(isMoscow(moved)).toBe(false);
    expect(moved.source).toBe("manual");
    expect(moved.formal).toBe("Тверь, улица Грина");
  });
});
