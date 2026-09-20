import { describe, expect, it } from "vitest";

import { SCENARIOS, SESSIONS } from "./journalFakeApi.testing";
import { buildAssignedModules, buildModuleCardFlow, collectModuleCardIds, toShortTitle } from "./modules";

const GROUPS = { "c-013": "пожар в жилом доме", "c-014": "Оказание медицинской скорой и неотложной помощи" };

describe("«Мои назначенные модули» (T2.2-15)", () => {
  it("только approved-сценарии занятий курсанта в состоянии «Настроено»/«Идёт»", () => {
    const modules = buildAssignedModules("u-005", SESSIONS, SCENARIOS, GROUPS);
    expect(modules.map((module) => module.id)).toEqual([
      "s-032",
      "s-005",
      "s-031",
      "s-021",
      "s-027",
      "s-028",
    ]);
    expect(buildAssignedModules("u-013", SESSIONS, SCENARIOS, GROUPS)).toEqual([]);
    const pending = SCENARIOS.map((scenario) => ({
      ...scenario,
      validation: { status: "pending" as const },
    }));
    expect(buildAssignedModules("u-005", SESSIONS, pending, GROUPS)).toEqual([]);
  });

  it("строка модуля: краткое название, категории, сложность, дедлайн (+60 мин от начала занятия)", () => {
    const [, ticket5] = buildAssignedModules("u-005", SESSIONS, SCENARIOS, GROUPS);
    expect(ticket5).toMatchObject({
      shortTitle: "Билет 05",
      categories: ["пожар в жилом доме", "Оказание медицинской скорой и неотложной помощи"],
      difficulty: 4,
      levelTitle: "продвинутый",
      deadline: "17.09.2026 12:20",
      teacherId: "u-002",
    });
    expect(toShortTitle("Билет 05: пожар-окно")).toBe("Билет 05");
    expect(collectModuleCardIds("u-005", SESSIONS, SCENARIOS)).toContain("c-013");
  });

  it("расписание модуля: только профильные карточки, шаг 3 мин, метки +03:00", () => {
    const [, ticket5] = buildAssignedModules("u-005", SESSIONS, SCENARIOS, GROUPS);
    const start = Date.parse("2026-09-17T11:50:44+03:00");
    expect(buildModuleCardFlow(ticket5, "u-005", start, new Set(["пожар в жилом доме"]))).toEqual([
      { cardId: "c-013", studentId: "u-005", issuedAt: "2026-09-17T11:50:44+03:00", level: 4 },
    ]);
    expect(buildModuleCardFlow(ticket5, "u-005", start, null).map((item) => item.issuedAt)).toEqual([
      "2026-09-17T11:50:44+03:00",
      "2026-09-17T11:53:44+03:00",
      "2026-09-17T11:56:44+03:00",
    ]);
  });
});
