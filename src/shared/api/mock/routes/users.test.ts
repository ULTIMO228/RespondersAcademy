// @vitest-environment node
/* GET /api/mock/users (T3.2-03): состав учебных групп преподавателю; обучающемуся — 403. */
import { beforeEach, describe, expect, it } from "vitest";

import { GET as usersRoute } from "../../../../../app/api/mock/users/route";
import type { ApiErrorBody, PublicUser, UserRole } from "../../types";
import { resetMockStore } from "../store";

const BASE = "http://localhost/api/mock/users";

function sessionCookie(userId: string, role: UserRole): string {
  const session = {
    userId,
    role,
    token: `mock-${userId}`,
    twoFactorUsed: true,
    issuedAt: new Date().toISOString(),
  };
  return `arm112_session=${encodeURIComponent(JSON.stringify(session))}`;
}

function request(query = "", viewer?: { userId: string; role: UserRole }): Request {
  const cookie = viewer ? sessionCookie(viewer.userId, viewer.role) : undefined;
  return new Request(`${BASE}${query}`, { headers: cookie ? { cookie } : {} });
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /api/mock/users", () => {
  it("преподавателю — курсанты своей группы с № АРМ и признаком блокировки", async () => {
    const response = await usersRoute(
      request("?role=student&group=ДДС-01", { userId: "u-002", role: "teacher" }),
    );
    expect(response.status).toBe(200);
    const users: PublicUser[] = await response.json();
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((user) => user.role === "student" && user.group === "ДДС-01")).toBe(true);
    expect(users.every((user) => !("password" in user))).toBe(true);
    expect(users.some((user) => !user.isActive)).toBe(true);
    expect(users[0].armNumber).toBeGreaterThan(0);
  });

  it("обучающемуся состав групп недоступен → 403", async () => {
    const response = await usersRoute(request("", { userId: "u-005", role: "student" }));
    expect(response.status).toBe(403);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("forbidden");
  });

  it("некорректная роль в фильтре → 400", async () => {
    const response = await usersRoute(request("?role=director", { userId: "u-002", role: "teacher" }));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.code).toBe("validationFailed");
  });
});
