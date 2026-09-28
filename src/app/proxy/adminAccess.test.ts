// @vitest-environment node
/*
 * T4.1-11: сквозная проверка матрицы доступа (spec/000-фронт/02-roles.md) на реальном гварде разделов —
 * Next Proxy `authProxy` (proxy.ts вызывает его для /arm, /teacher, /admin).
 *
 * ОТКЛОНЕНИЕ ОТ ПЛАНА: в задаче указан `e2e/admin-access.spec.ts` (Playwright), но Playwright в проекте
 * не установлен и новых зависимостей волна не добавляет (бриф) — вместо e2e интеграционный тест на том же
 * коде, что исполняется в рантайме. Дефекты гвардов чинятся в волне 2; здесь — только проверка и фиксация.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { ROLE_ACCESS_ROWS } from "@/entities/user";
import type { AuthSession, UserRole } from "@/shared/api";
import { NAV_ITEMS } from "@/widgets/app-nav";

import { authProxy } from "./authProxy";

const HTTP_FORBIDDEN = 403;
const HTTP_REDIRECT = 307;
const ORIGIN = "http://localhost:3000";

const USER_BY_ROLE: Record<UserRole, string> = { student: "u-005", teacher: "u-002", admin: "u-001" };

/** Разделы матрицы: админские, преподавательские и АРМ обучающегося (с динамическим сегментом). */
const ROUTES_UNDER_TEST = [
  "/admin/users",
  "/admin/system",
  "/teacher",
  "/teacher/scenarios",
  "/teacher/reports",
  "/teacher/session",
  "/teacher/monitor/u-005",
  "/arm",
  "/arm/card/card-881412",
  "/arm/phone",
  "/arm/progress",
  "/arm/help",
];

function sessionCookie(role: UserRole): string {
  const session: AuthSession = {
    userId: USER_BY_ROLE[role],
    role,
    token: `mock-${USER_BY_ROLE[role]}`,
    twoFactorUsed: true,
    issuedAt: new Date().toISOString(),
  };
  return `arm112_session=${encodeURIComponent(JSON.stringify(session))}`;
}

function visit(pathname: string, role?: UserRole): ReturnType<typeof authProxy> {
  const headers = role ? { cookie: sessionCookie(role) } : undefined;
  return authProxy(new NextRequest(new URL(pathname, ORIGIN), { headers }));
}

/** Ожидание по матрице ролей: доступ есть → 200 (next), нет → 403. */
function isAllowed(role: UserRole, pathname: string): boolean {
  const row = ROLE_ACCESS_ROWS.find((candidate) =>
    pathname.startsWith(candidate.route.replace(/\/\[.+\]$/, "")),
  );
  return row?.access[role].allowed ?? false;
}

const MATRIX = (["student", "teacher", "admin"] as const).flatMap((role) =>
  ROUTES_UNDER_TEST.map((pathname) => ({ role, pathname, allowed: isAllowed(role, pathname) })),
);

describe("матрица доступа: роль × раздел (spec/000-фронт/02-roles.md)", () => {
  it.each(MATRIX.map((item) => [`${item.role} → ${item.pathname}`, item] as const))(
    "%s",
    (_title, { role, pathname, allowed }) => {
      const response = visit(pathname, role);
      if (allowed) {
        expect(response.status).not.toBe(HTTP_FORBIDDEN);
        expect(response.headers.get("x-middleware-rewrite")).toBeNull();
      } else {
        expect(response.status).toBe(HTTP_FORBIDDEN);
        expect(response.headers.get("x-middleware-rewrite")).toContain("/forbidden");
      }
    },
  );

  it("администратор не попадает на /arm/* и /teacher/* (403)", () => {
    for (const pathname of ["/arm", "/arm/card/card-881412", "/teacher", "/teacher/reports"]) {
      expect(visit(pathname, "admin").status).toBe(HTTP_FORBIDDEN);
    }
  });

  it("обучающийся и преподаватель не попадают на /admin/users и /admin/system (403)", () => {
    for (const role of ["student", "teacher"] as const) {
      expect(visit("/admin/users", role).status).toBe(HTTP_FORBIDDEN);
      expect(visit("/admin/system", role).status).toBe(HTTP_FORBIDDEN);
    }
  });

  it("неавторизованный — редирект на /login с returnUrl", () => {
    const response = visit("/admin/users");
    expect(response.status).toBe(HTTP_REDIRECT);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/login");
    expect(location).toContain("returnUrl=%2Fadmin%2Fusers");
  });

  it("администратор проходит на оба админских раздела", () => {
    for (const pathname of ["/admin/users", "/admin/system"]) {
      const response = visit(pathname, "admin");
      expect(response.status).not.toBe(HTTP_FORBIDDEN);
      expect(response.headers.get("location")).toBeNull();
    }
  });
});

describe("навигация администратора", () => {
  it("не содержит ссылок на преподавательские разделы (оценки/сценарии/отчёты)", () => {
    const hrefs = NAV_ITEMS.admin.map((item) => item.href);
    expect(hrefs).toEqual(["/admin/users", "/admin/system"]);
    expect(hrefs.some((href) => href.startsWith("/teacher") || href.startsWith("/arm"))).toBe(false);
  });
});
