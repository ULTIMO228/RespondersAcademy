import { describe, expect, it } from "vitest";

import { formatUptime } from "./formatUptime";

describe("formatUptime", () => {
  it("форматирует дни и часы", () => {
    expect(formatUptime(1_058_400)).toBe("12 д 06:00");
  });

  it("остановленный сервис — прочерк", () => {
    expect(formatUptime(0)).toBe("—");
  });

  it("неполный час округляется вниз до минут", () => {
    expect(formatUptime(7_320)).toBe("0 д 02:02");
  });
});
