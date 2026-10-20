import { describe, expect, it } from "vitest";

import { formatAon } from "./aon";

describe("formatAon", () => {
  it("10 и 11 цифр → +7 (XXX) XXX-XX-XX", () => {
    expect(formatAon("9161263471")).toBe("+7 (916) 126-34-71");
    expect(formatAon("84995503456")).toBe("+7 (499) 550-34-56");
    expect(formatAon("+7 499 550 34 56")).toBe("+7 (499) 550-34-56");
  });

  it("нестандартный номер не искажается", () => {
    expect(formatAon("112")).toBe("112");
    expect(formatAon("")).toBe("");
  });
});
