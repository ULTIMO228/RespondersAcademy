// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { GET as servicesRoute } from "../../../../../app/api/mock/admin/services/route";
import { GET as settingsRoute } from "../../../../../app/api/mock/admin/settings/route";
import { POST as toggleRoute } from "../../../../../app/api/mock/admin/users/[id]/toggle-active/route";
import { GET as usersRoute } from "../../../../../app/api/mock/admin/users/route";
import type { AuditLogEntry, PageResponse, PublicUser } from "../../types";
import { resetMockStore } from "../store";

const AUDIT_URL = "http://localhost/api/mock/admin/audit";

const ADMIN_ID = "u-001";
const TARGET_ID = "u-005";
const USER_COUNT = 24;

function toggle(id: string, body: unknown): Promise<Response> {
  const request = new Request(`http://localhost/api/mock/admin/users/${id}/toggle-active`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return toggleRoute(request, { params: Promise.resolve({ id }) });
}

const USERS_URL = "http://localhost/api/mock/admin/users";

async function users(): Promise<PublicUser[]> {
  return (await usersRoute(new Request(USERS_URL))).json();
}

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-19T12:00:00+03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/mock/admin/users", () => {
  // Фильтры и поиск реестра — routes/admin-users.test.ts (T4.1-02); здесь — PII-гигиена ответа.
  it("24 пользователя, пароль не утекает в сериализацию", async () => {
    const response = await usersRoute(new Request(USERS_URL));
    const raw = await response.text();
    const body = JSON.parse(raw) as PublicUser[];
    expect(body).toHaveLength(USER_COUNT);
    expect(body.every((user) => !("password" in user))).toBe(true);
    expect(raw).not.toMatch(/password|112"/);
  });
});

describe("POST /api/mock/admin/users/[id]/toggle-active", () => {
  it("isActive инвертируется, виден в GET; в аудите запись с ISO-меткой и userId администратора", async () => {
    const response = await toggle(TARGET_ID, { adminId: ADMIN_ID });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: TARGET_ID, isActive: false });
    expect((await users()).find((user) => user.id === TARGET_ID)?.isActive).toBe(false);
    const auditPage: PageResponse<AuditLogEntry> = await (await auditRoute(new Request(AUDIT_URL))).json();
    const audit = auditPage.items;
    expect(audit[0]).toMatchObject({
      userId: ADMIN_ID,
      role: "admin",
      action: "user.block",
      at: "2026-09-19T12:00:00+03:00",
    });
    await toggle(TARGET_ID, { adminId: ADMIN_ID });
    expect((await users()).find((user) => user.id === TARGET_ID)?.isActive).toBe(true);
  });

  it("несуществующий id → 404; не-админ → 403; без adminId → 400; сам себя → 409", async () => {
    expect((await toggle("u-999", { adminId: ADMIN_ID })).status).toBe(404);
    expect((await toggle(TARGET_ID, { adminId: "u-002" })).status).toBe(403);
    expect((await toggle(TARGET_ID, {})).status).toBe(400);
    expect((await toggle(ADMIN_ID, { adminId: ADMIN_ID })).status).toBe(409);
  });
});

describe("GET /api/mock/admin/services | settings", () => {
  it("мок-состояния из store", async () => {
    expect(((await (await servicesRoute()).json()) as unknown[]).length).toBeGreaterThan(0);
    expect(await (await settingsRoute()).json()).toHaveProperty("backup.periodHours");
  });
});
