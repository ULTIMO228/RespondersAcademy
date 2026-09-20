/* T3.1-01: тонкий роут `/teacher/scenarios/[id]` и smoke-рендер страницы редактора. */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type * as SharedApi from "@/shared/api";
import type { AuthSession, PublicUser } from "@/shared/api";

const TEACHER = { id: "u-002", fullName: "Морозова Елена Сергеевна", role: "teacher" } as PublicUser;

vi.mock("@/entities/user/index.server", () => ({
  getSessionUser: async () => ({ user: TEACHER, session: {} as AuthSession }),
}));

vi.mock("@/shared/api", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedApi>();
  return { ...actual, getScenario: async () => actual.scenarios[0] };
});

describe("Страница редактора сценария (T3.1-01)", () => {
  it("роут тонкий: реэкспорт слайса без собственной логики", async () => {
    const [route, slice] = await Promise.all([
      import("../../../../app/teacher/scenarios/[id]/page"),
      import("../index"),
    ]);
    expect(route.default).toBe(slice.TeacherScenarioEditorPage);
  });

  it("smoke: страница рендерит редактор сценария из мок-слоя", async () => {
    const { TeacherScenarioEditorPage } = await import("./TeacherScenarioEditorPage");
    render(await TeacherScenarioEditorPage({ params: Promise.resolve({ id: "s-001" }) }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "К списку сценариев" })).toBeInTheDocument();
  });
});
