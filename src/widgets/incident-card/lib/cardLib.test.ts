import { describe, expect, it } from "vitest";

import { armCardFixtures } from "@/shared/api";

import { parseAddress } from "./parseAddress";
import { parseJournal } from "./parseJournal";
import { applyPhoneInput, formatPhoneMask } from "./phoneMask";

describe("parseAddress", () => {
  it("раскладывает адрес по полям", () => {
    const fields = parseAddress({
      formal: "Россия, Москва, (ЮАО, Чертаново Южное), Чертановская улица, 58, к. 2, под. 2",
      okrug: "ЮАО",
      raion: "Чертаново Южное",
      descriptive: "Дерево во дворе дома",
    });
    expect(fields).toMatchObject({
      country: "Россия",
      subject: "Москва",
      locality: "Москва",
      okrug: "ЮАО",
      raion: "Чертаново Южное",
      street: "Чертановская улица",
      house: "58",
      building: "2",
      entrance: "2",
    });
  });

  it("этаж — из описательного адреса", () => {
    const card = armCardFixtures.find((fixture) => fixture.id === "card-36814845");
    expect(card && parseAddress(card.address).floor).toBe("3");
  });
});

describe("parseJournal", () => {
  it("разбирает строку журнала", () => {
    expect(parseJournal("17.09.2026 11:13:19 УМЦ О.п. - Пожар в квартире")).toEqual([
      { at: "17.09.2026 11:13:19", author: "УМЦ О.п.", text: "Пожар в квартире" },
    ]);
    expect(parseJournal("Карточка из ВИС")).toEqual([{ text: "Карточка из ВИС" }]);
  });
});

describe("formatPhoneMask", () => {
  it("маскирует номер", () => {
    expect(formatPhoneMask("+7 (977) 567-56-76")).toBe("+7 (977) 567-56-76");
    expect(formatPhoneMask("977567")).toBe("+7 (977) 567-__-__");
    expect(formatPhoneMask("")).toBe("");
  });
});

describe("applyPhoneInput", () => {
  it("добавляет и удаляет цифры", () => {
    expect(applyPhoneInput("", "9")).toBe("9");
    expect(applyPhoneInput("977", "+7 (977) ___-__-_")).toBe("97");
    expect(applyPhoneInput("977", "+7 (977) ___-__-__5")).toBe("9775");
  });
});
