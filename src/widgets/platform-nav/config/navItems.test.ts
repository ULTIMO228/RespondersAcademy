import { describe, expect, it } from "vitest";

import { ROUTES } from "@/shared/config";

import { resolveCrumbs } from "../lib/breadcrumbs";
import { isNavEntryActive, PLATFORM_NAV, resolvePlatformNav } from "./navItems";

const armLinks = (zones: ("operator112" | "dds")[]) =>
  resolvePlatformNav("student", zones)
    .filter((entry) => entry.title.startsWith("Открыть АРМ"))
    .map((entry) => [entry.title, entry.href]);

describe("resolvePlatformNav: вход в АРМ по специализации", () => {
  it("только ДДС: один пункт на /arm", () => {
    expect(armLinks(["dds"])).toEqual([["Открыть АРМ", "/arm"]]);
  });

  it("только 112: один пункт на /arm/operator112, входа в журнал ДДС нет", () => {
    expect(armLinks(["operator112"])).toEqual([["Открыть АРМ", "/arm/operator112"]]);
  });

  it("две специализации: два подписанных пункта, разделитель только перед первым", () => {
    expect(armLinks(["operator112", "dds"])).toEqual([
      ["Открыть АРМ 112", "/arm/operator112"],
      ["Открыть АРМ ДДС", "/arm"],
    ]);
    const separators = resolvePlatformNav("student", ["operator112", "dds"]).filter(
      (entry) => entry.title.startsWith("Открыть АРМ") && entry.separatorBefore,
    );
    expect(separators).toHaveLength(1);
  });

  it("преподаватель и администратор: набор без изменений", () => {
    expect(resolvePlatformNav("teacher", []).some((entry) => entry.href === "/teacher")).toBe(true);
    expect(resolvePlatformNav("admin", []).some((entry) => entry.href === "/admin/users")).toBe(true);
  });
});

describe("пункт «Сценарии» обучающегося", () => {
  const entry = PLATFORM_NAV.student.find((item) => item.href === ROUTES.studentScenarios);

  it("есть только у обучающегося и активен на списке и прохождении", () => {
    expect(entry?.title).toBe("Сценарии");
    expect(PLATFORM_NAV.admin.some((item) => item.href === ROUTES.studentScenarios)).toBe(false);
    expect(isNavEntryActive(entry!, "/student/scenarios")).toBe(true);
    expect(isNavEntryActive(entry!, ROUTES.studentScenarioRun("s-ai-001", 2))).toBe(true);
    expect(isNavEntryActive(entry!, "/student/assignments")).toBe(false);
  });

  it("не зависит от специализации: виден при любой зоне", () => {
    for (const zones of [["dds"], ["operator112"], ["operator112", "dds"]] as const) {
      expect(resolvePlatformNav("student", zones).some((item) => item.href === ROUTES.studentScenarios)).toBe(
        true,
      );
    }
  });

  it("крошки: список — «Сценарии», прохождение — со ссылкой на список", () => {
    expect(ROUTES.studentScenarioRun("s ai", 2)).toBe("/student/scenarios/s%20ai/2");
    expect(
      resolveCrumbs("student", ROUTES.studentScenarioRun("s-ai-001", 2)).map((crumb) => crumb.title),
    ).toEqual(expect.arrayContaining(["Сценарии", "Прохождение сценария"]));
  });
});
