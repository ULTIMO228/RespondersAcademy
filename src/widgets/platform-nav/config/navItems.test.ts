import { describe, expect, it } from "vitest";

import { ROUTES } from "@/shared/config";

import { resolveCrumbs } from "../lib/breadcrumbs";
import { isNavEntryActive, PLATFORM_NAV } from "./navItems";

describe("пункт «Сценарии» обучающегося", () => {
  const entry = PLATFORM_NAV.student.find((item) => item.href === ROUTES.studentScenarios);

  it("есть только у обучающегося и активен на списке и прохождении", () => {
    expect(entry?.title).toBe("Сценарии");
    expect(PLATFORM_NAV.admin.some((item) => item.href === ROUTES.studentScenarios)).toBe(false);
    expect(isNavEntryActive(entry!, "/student/scenarios")).toBe(true);
    expect(isNavEntryActive(entry!, ROUTES.studentScenarioRun("s-ai-001", 2))).toBe(true);
    expect(isNavEntryActive(entry!, "/student/assignments")).toBe(false);
  });

  it("крошки: список — «Сценарии», прохождение — со ссылкой на список", () => {
    expect(ROUTES.studentScenarioRun("s ai", 2)).toBe("/student/scenarios/s%20ai/2");
    expect(
      resolveCrumbs("student", ROUTES.studentScenarioRun("s-ai-001", 2)).map((crumb) => crumb.title),
    ).toEqual(expect.arrayContaining(["Сценарии", "Прохождение сценария"]));
  });
});
