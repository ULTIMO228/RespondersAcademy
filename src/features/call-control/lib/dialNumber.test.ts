import { describe, expect, it } from "vitest";

import { reference } from "@/shared/api";

import { checkDialNumber, isDialFormatValid } from "./dialNumber";

describe("checkDialNumber", () => {
  it("формат: только 3–4 цифры", () => {
    expect(isDialFormatValid("30")).toBe(false);
    expect(isDialFormatValid("301")).toBe(true);
    expect(isDialFormatValid("3011")).toBe(true);
    expect(isDialFormatValid("30111")).toBe(false);
    expect(isDialFormatValid("30*")).toBe(false);
  });

  it("2-значный номер — ошибка формата, 999 — «Абонент не найден», 301 — запись справочника", () => {
    expect(checkDialNumber("30", reference.internalNumbers)).toMatchObject({ ok: false, reason: "format" });
    expect(checkDialNumber("999", reference.internalNumbers)).toEqual({
      ok: false,
      reason: "notFound",
      message: "Абонент не найден",
    });
    expect(checkDialNumber("301", reference.internalNumbers)).toEqual({
      ok: true,
      entry: { number: "301", title: "Руководитель дежурной смены ДДС" },
    });
  });
});
