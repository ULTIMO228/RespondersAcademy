import { describe, expect, it } from "vitest";

import { getPageCount, toRangeLabel } from "./pagination";

describe("пагинация ленты (T2.2-08)", () => {
  it("число страниц: пустая выдача — одна страница, остаток — ещё страница", () => {
    expect(getPageCount(0, 10)).toBe(1);
    expect(getPageCount(10, 10)).toBe(1);
    expect(getPageCount(11, 10)).toBe(2);
    expect(getPageCount(108, 20)).toBe(6);
  });

  it("подпись диапазона «1-10 из N», последняя неполная страница, «0 из 0»", () => {
    expect(toRangeLabel(0, 10, 108)).toBe("1-10 из 108");
    expect(toRangeLabel(10, 10, 108)).toBe("101-108 из 108");
    expect(toRangeLabel(0, 10, 0)).toBe("0 из 0");
  });
});
