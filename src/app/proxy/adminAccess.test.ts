// @vitest-environment node
/*
 * T4.1-11: сквозная проверка матрицы доступа (spec/000-фронт/02-roles.md) на реальном гварде разделов —
 * Next Proxy `authProxy` (proxy.ts вызывает его для /arm, /student, /teacher, /admin).
 *
 * ОТКЛОНЕНИЕ ОТ ПЛАНА: в задаче указан `e2e/admin-access.spec.ts` (Playwright), но Playwright в проекте
 * не установлен и новых зависимостей волна не добавляет (бриф) — вместо e2e интеграционный тест на том же
 * коде, что исполняется в рантайме. Дефекты гвардов чинятся в волне 2; здесь — только проверка и фиксация.
 */
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { RETURN_URL_HEADER, ROLE_ACCESS_ROWS } from "@/entities/user";
import type { UserRole } from "@/shared/api";
import { NAV_ITEMS } from "@/widgets/app-nav";

import { buildSessionCookie } from "../../../app/api/mock/_server/testing";

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
  "/arm/operator112",
  "/student/assignments",
  "/arm/progress",
  "/arm/help",
];

/** Подписанная cookie сессии, какую выдаёт сервер мок-слоя (proxy подпись не проверяет — читает только поля). */
function sessionCookie(role: UserRole): string {
  return buildSessionCookie(USER_BY_ROLE[role]);
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

  it("/student/assignments (задания, спека 002): только обучающийся; преподаватель и администратор — 403, аноним — на /login", () => {
    expect(visit("/student/assignments", "student").status).not.toBe(HTTP_FORBIDDEN);
    for (const role of ["teacher", "admin"] as const) {
      const response = visit("/student/assignments", role);
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.headers.get("x-middleware-rewrite")).toContain("/forbidden");
    }
    const anonymous = visit("/student/assignments");
    expect(anonymous.status).toBe(HTTP_REDIRECT);
    expect(anonymous.headers.get("location")).toContain("returnUrl=%2Fstudent%2Fassignments");
  });

  it("/arm/operator112 (режим 112, спека 002): только обучающийся; преподаватель и администратор — 403, аноним — на /login", () => {
    const path = "/arm/operator112?assignmentId=asg-001";
    expect(visit(path, "student").status).not.toBe(HTTP_FORBIDDEN);
    expect(visit(path, "student").headers.get("x-middleware-rewrite")).toBeNull();
    for (const role of ["teacher", "admin"] as const) {
      const response = visit(path, role);
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.headers.get("x-middleware-rewrite")).toContain("/forbidden");
    }
    const anonymous = visit(path);
    expect(anonymous.status).toBe(HTTP_REDIRECT);
    expect(anonymous.headers.get("location")).toContain(`returnUrl=${encodeURIComponent(path)}`);
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

describe("cookie сессии: proxy оптимистичен (T036, SC-009)", () => {
  const forgedJson = encodeURIComponent(
    JSON.stringify({
      userId: "u-001",
      role: "admin",
      token: "x",
      twoFactorUsed: false,
      issuedAt: new Date().toISOString(),
    }),
  );

  function visitWith(pathname: string, cookie: string) {
    return authProxy(new NextRequest(new URL(pathname, ORIGIN), { headers: { cookie } }));
  }

  function jwtWith(claims: Record<string, unknown>): string {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${encode({ alg: "HS256", typ: "JWT" })}.${encode(claims)}.${"A".repeat(43)}`;
  }

  it('подделанная JSON-cookie с role:"admin" (старый формат) больше не пускает — редирект на /login', () => {
    const response = visitWith("/admin/users", `arm112_session=${forgedJson}`);
    expect(response.status).toBe(HTTP_REDIRECT);
    expect(response.headers.get("location")).toContain("/login?returnUrl=%2Fadmin%2Fusers");
    expect(response.headers.get("set-cookie")).toMatch(/arm112_session=;/);
  });

  it("мусор вместо токена — как отсутствие сессии", () => {
    for (const value of ["garbage", "a.b.c", "..", ""]) {
      expect(visitWith("/arm", `arm112_session=${value}`).status).toBe(HTTP_REDIRECT);
    }
  });

  it("токен с истёкшим exp → /login?reason=expired, cookie удаляется", () => {
    const expired = jwtWith({ sub: "u-005", role: "student", exp: Math.floor(Date.now() / 1000) - 10 });
    const response = visitWith("/arm", `arm112_session=${expired}`);
    expect(response.status).toBe(HTTP_REDIRECT);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("reason=expired");
    expect(location).toContain("returnUrl=%2Farm");
    expect(response.headers.get("set-cookie")).toMatch(/arm112_session=;/);
  });

  it("чужая роль в токене → 403 /forbidden, а не /login", () => {
    const teacher = jwtWith({ sub: "u-002", role: "teacher", exp: Math.floor(Date.now() / 1000) + 600 });
    const response = visitWith("/admin/system", `arm112_session=${teacher}`);
    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(response.headers.get("x-middleware-rewrite")).toContain("/forbidden");
  });

  it("подпись proxy НЕ проверяет: токен с верной структурой и чужой подписью проходит proxy — его остановит verifySession()", () => {
    const unsigned = jwtWith({ sub: "u-001", role: "admin", exp: Math.floor(Date.now() / 1000) + 600 });
    const response = visitWith("/admin/users", `arm112_session=${unsigned}`);
    expect(response.status).not.toBe(HTTP_REDIRECT);
    expect(response.status).not.toBe(HTTP_FORBIDDEN);
  });

  it("допущенному запросу проставляется заголовок возврата для серверных лэйаутов", () => {
    const response = visit("/teacher/scenarios?x=1", "teacher");
    expect(response.headers.get(`x-middleware-request-${RETURN_URL_HEADER}`)).toBe("/teacher/scenarios?x=1");
  });
});
