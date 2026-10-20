import { describe, expect, it } from "vitest";

import { resolvePlatformNav } from "./navItems";

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
