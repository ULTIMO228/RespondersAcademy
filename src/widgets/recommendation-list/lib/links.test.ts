import { describe, expect, it } from "vitest";

import type { Recommendation } from "@/shared/api";

import { describeReason, recommendationHref } from "./links";

const base: Recommendation = {
  id: "rec-1",
  kind: "article",
  targetId: "kb-012",
  title: "Пожар в жилом доме",
  reason: { errorType: "addressMissing", count: 5, ruleId: "R22" },
  createdAt: "2026-09-29T10:00:00+03:00",
};

describe("recommendationHref (A5: текста статьи в рекомендации нет)", () => {
  it("article → статья справочника по targetId", () => {
    expect(recommendationHref(base)).toBe("/reference?article=kb-012");
  });
  it("category → справочник с поиском по группе (кириллица кодируется)", () => {
    expect(recommendationHref({ ...base, kind: "category", targetId: "Пожары в зданиях" })).toBe(
      "/reference?q=%D0%9F%D0%BE%D0%B6%D0%B0%D1%80%D1%8B%20%D0%B2%20%D0%B7%D0%B4%D0%B0%D0%BD%D0%B8%D1%8F%D1%85",
    );
  });
  it("card и mode → задания", () => {
    expect(recommendationHref({ ...base, kind: "card", targetId: "c-010" })).toBe("/student/assignments");
    expect(recommendationHref({ ...base, kind: "mode", targetId: "dds" })).toBe("/student/assignments");
  });
});

describe("describeReason", () => {
  it("тип ошибки и число раз со склонением", () => {
    expect(
      describeReason({ ...base, reason: { errorType: "addressMissing", count: 1, ruleId: "R22" } }),
    ).toBe("Заполнение · addressMissing — 1 раз");
    expect(
      describeReason({ ...base, reason: { errorType: "addressMissing", count: 3, ruleId: "R22" } }),
    ).toContain("3 раза");
    expect(
      describeReason({ ...base, reason: { errorType: "addressMissing", count: 12, ruleId: "R22" } }),
    ).toContain("12 раз");
  });
  it("modeGap — неравномерность режимов", () => {
    expect(describeReason({ ...base, reason: { errorType: "modeGap", count: 1, ruleId: "R10" } })).toMatch(
      /неравномерно/,
    );
  });
});
