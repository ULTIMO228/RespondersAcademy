import { describe, expect, it } from "vitest";

import { formatListAddress, parseRegisteredBy, pickCodeFromServiceIds, splitDescription } from "./parse";

describe("parse (проекция ленты)", () => {
  it("разбирает «Опер. 4, АРМ 4, УМЦ О.п.»", () => {
    expect(parseRegisteredBy("Опер. 4, АРМ 4, УМЦ О.п.")).toEqual({ operatorNumber: "4", armNumber: "4" });
    expect(parseRegisteredBy("СОДЧ (МВД)")).toEqual({ operatorNumber: "0", armNumber: "" });
  });

  it("делит описание на служебную часть и текст", () => {
    expect(splitDescription("17.09.2026 11:13:19 УМЦ О.п. - Пожар в квартире")).toEqual({
      meta: "17.09.2026 11:13:19 УМЦ О.п. -",
      text: "Пожар в квартире",
    });
    expect(splitDescription("")).toBeNull();
  });

  it("убирает страну из адреса и берёт код главной службы", () => {
    expect(formatListAddress("Россия, Москва, (ТАО, Вороновское)")).toBe("Москва, (ТАО, Вороновское)");
    expect(pickCodeFromServiceIds(["svc-gkh", "svc-101"], "1050101")).toBe("101");
    expect(pickCodeFromServiceIds(["svc-gkh"], "1050101")).toBe("1050101");
  });
});
