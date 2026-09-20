import { describe, expect, it } from "vitest";

import { PROFILE_CATEGORIES } from "@/entities/session";

import { filterByProfile, isProfileCard, resolveProfileGroups } from "./profileFilter";

const FEED = [
  { id: "c-001", group: "Качество воды, нет воды, канализация" },
  { id: "c-002", group: "Запах газа в помещении (в доме, в квартире)" },
  { id: "c-003", group: "пожар в жилом доме" },
];

describe("профильный фильтр ленты (T2.2-14)", () => {
  it("резолвер User.service → группы ЕКП по таблице привязки преподавателя", () => {
    const water = resolveProfileGroups("Мосводоканал (учебный профиль)", PROFILE_CATEGORIES);
    expect(water && [...water]).toEqual([
      "аварии в городском хозяйстве - прорыв воды",
      "качество воды, нет воды, канализация",
      "скопление воды подтопление паводок",
    ]);
    expect(resolveProfileGroups("ДДС района Царицыно", PROFILE_CATEGORIES)).toBeNull();
    expect(resolveProfileGroups(undefined, PROFILE_CATEGORIES)).toBeNull();
  });

  it("Мосводоканал видит только свои группы, Мосгаз — другой набор, без профиля — всё", () => {
    const byGroup = (item: { group: string }) => item.group;
    const water = resolveProfileGroups("Мосводоканал (учебный профиль)", PROFILE_CATEGORIES);
    const gas = resolveProfileGroups("Мосгаз (учебный профиль)", PROFILE_CATEGORIES);
    expect(filterByProfile(FEED, byGroup, water).map((item) => item.id)).toEqual(["c-001"]);
    expect(filterByProfile(FEED, byGroup, gas).map((item) => item.id)).toEqual(["c-002"]);
    expect(filterByProfile(FEED, byGroup, null)).toHaveLength(3);
    expect(
      isProfileCard(
        "ПОЖАР В ЖИЛОМ ДОМЕ",
        resolveProfileGroups("ДДС района Чертаново Южное", PROFILE_CATEGORIES),
      ),
    ).toBe(true);
  });
});
