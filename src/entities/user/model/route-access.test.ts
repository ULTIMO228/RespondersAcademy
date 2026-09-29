import { describe, expect, it } from "vitest";

import type { UserRole } from "@/shared/api";

import { buildLoginHref, canAccessRoute, isProtectedPath, resolveRouteAccess } from "./route-access";
import type { SessionClaims } from "./session";

const ISSUED_AT = "2026-09-17T11:13:19+03:00";
const NOW = Date.parse(ISSUED_AT) + 1000;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/** Заявленные поля токена сессии (proxy читает их без проверки подписи). */
function sessionOf(role: UserRole): SessionClaims {
  return { userId: "u-x", role, expiresAtMs: Date.parse(ISSUED_AT) + SESSION_TTL_MS };
}

/** Матрица spec/000-фронт/02-roles.md: путь → роли с доступом. */
const MATRIX: [string, UserRole[]][] = [
  ["/arm", ["student"]],
  ["/arm/card/card-881412", ["student"]],
  ["/arm/phone", ["student"]],
  ["/arm/progress", ["student"]],
  ["/arm/help", ["student"]],
  ["/student/assignments", ["student"]],
  ["/student", ["student"]],
  ["/teacher", ["teacher"]],
  ["/teacher/monitor/u-005", ["teacher"]],
  ["/teacher/scenarios/sc-1", ["teacher"]],
  ["/teacher/session", ["teacher"]],
  ["/teacher/reports/s-1", ["teacher"]],
  ["/admin", ["admin"]],
  ["/admin/users", ["admin"]],
  ["/admin/system", ["admin"]],
];

describe("canAccessRoute — матрица доступа 02-roles.md", () => {
  it.each(MATRIX)("%s доступен только ролям %j", (path, allowed) => {
    (["student", "teacher", "admin"] as UserRole[]).forEach((role) => {
      expect(canAccessRoute(role, path)).toBe(allowed.includes(role));
    });
  });

  it("вход и вне матрицы — открыты", () => {
    expect(isProtectedPath("/login")).toBe(false);
    expect(isProtectedPath("/forbidden")).toBe(false);
    expect(isProtectedPath("/armory")).toBe(false);
    expect(canAccessRoute("student", "/login")).toBe(true);
  });
});

describe("resolveRouteAccess", () => {
  it("аноним на /arm → unauthenticated; студент на /teacher и /admin/users → forbidden", () => {
    expect(resolveRouteAccess("/arm", null, NOW)).toBe("unauthenticated");
    expect(resolveRouteAccess("/teacher", sessionOf("student"), NOW)).toBe("forbidden");
    expect(resolveRouteAccess("/admin/users", sessionOf("student"), NOW)).toBe("forbidden");
    expect(resolveRouteAccess("/arm", sessionOf("teacher"), NOW)).toBe("forbidden");
    expect(resolveRouteAccess("/arm/phone", sessionOf("student"), NOW)).toBe("allowed");
    expect(resolveRouteAccess("/login", null, NOW)).toBe("public");
  });

  it("сессия старше 24 ч → expired", () => {
    expect(resolveRouteAccess("/arm", sessionOf("student"), Date.parse(ISSUED_AT) + SESSION_TTL_MS)).toBe(
      "expired",
    );
  });
});

describe("buildLoginHref", () => {
  it("returnUrl кодируется, reason=expired добавляется", () => {
    expect(buildLoginHref()).toBe("/login");
    expect(buildLoginHref("/arm/card/card-881412?x=1")).toBe(
      "/login?returnUrl=%2Farm%2Fcard%2Fcard-881412%3Fx%3D1",
    );
    expect(buildLoginHref(undefined, "expired")).toBe("/login?reason=expired");
  });
});
