/* T3.1-01: тонкие роуты, гвард роли и smoke-рендер обеих страниц конструктора сценариев. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { canAccessRoute, resolveRouteAccess } from "@/entities/user";
import type { SessionClaims } from "@/entities/user";
import type * as SharedApi from "@/shared/api";
import type { PublicUser } from "@/shared/api";
import { ROUTES } from "@/shared/config";

const TEACHER = { id: "u-002", fullName: "Морозова Елена Сергеевна", role: "teacher" } as PublicUser;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/entities/user/index.server", () => ({
  getSessionUser: async () => ({ user: TEACHER }),
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedApi>();
  return {
    ...actual,
    listScenarios: async () => [],
    getReference: async () => actual.reference,
    listMaterials: async () => [],
    getProfileMapping: async () => [],
    getScenario: async () => actual.scenarios[0],
  };
});

const SCENARIO_ROUTE = ROUTES.teacherScenario("s-032");
const NOW = Date.now();

function session(role: PublicUser["role"]): SessionClaims {
  return { userId: "u-001", role, expiresAtMs: NOW + 60_000 };
}

describe("Роуты и гвард раздела (T3.1-01)", () => {
  it("роут тонкий: реэкспорт слайса без собственной логики", async () => {
    const [listRoute, listSlice] = await Promise.all([
      import("../../../../app/teacher/scenarios/page"),
      import("../index"),
    ]);
    expect(listRoute.default).toBe(listSlice.TeacherScenariosPage);
  });

  it("обе страницы доступны teacher и закрыты student/admin (403)", () => {
    for (const route of [ROUTES.teacherScenarios, SCENARIO_ROUTE]) {
      expect(canAccessRoute("teacher", route)).toBe(true);
      expect(canAccessRoute("student", route)).toBe(false);
      expect(canAccessRoute("admin", route)).toBe(false);
      expect(resolveRouteAccess(route, session("student"), NOW)).toBe("forbidden");
      expect(resolveRouteAccess(route, session("admin"), NOW)).toBe("forbidden");
      expect(resolveRouteAccess(route, session("teacher"), NOW)).toBe("allowed");
      expect(resolveRouteAccess(route, null, NOW)).toBe("unauthenticated");
    }
  });

  it("smoke: /teacher/scenarios рендерит заголовок и каталог", async () => {
    const { TeacherScenariosPage } = await import("./TeacherScenariosPage");
    render(await TeacherScenariosPage());
    expect(screen.getByRole("heading", { level: 1, name: "Сценарии и эталоны" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Создать сценарий" })).toBeInTheDocument();
  });
});
