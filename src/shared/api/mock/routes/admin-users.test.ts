// @vitest-environment node
/*
 * T4.1-02 / T4.1-03: реестр пользователей администратора на реальных route handlers.
 * Фильтры и поиск списка, создание (409 на дубликат логина), редактирование и смена роли,
 * блокировка/разблокировка и сброс пароля — каждая мутация пишет запись в журнал аудита.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { PATCH as patchUserRoute } from "../../../../../app/api/mock/admin/users/[id]/route";
import { POST as blockRoute } from "../../../../../app/api/mock/admin/users/[id]/block/route";
import { POST as resetPasswordRoute } from "../../../../../app/api/mock/admin/users/[id]/reset-password/route";
import { POST as unblockRoute } from "../../../../../app/api/mock/admin/users/[id]/unblock/route";
import { GET as usersRoute, POST as createUserRoute } from "../../../../../app/api/mock/admin/users/route";
import { POST as loginRoute } from "../../../../../app/api/mock/auth/login/route";
import type {
  AdminUserPasswordResetResponse,
  ApiErrorBody,
  AuditLogEntry,
  PageResponse,
  PublicUser,
} from "../../types";
import { resetMockStore } from "../store";

const AUDIT_URL = "http://localhost/api/mock/admin/audit";

const BASE = "http://localhost/api/mock/admin/users";
const ADMIN_ID = "u-001";
const TEACHER_ID = "u-002";
const STUDENT_ID = "u-005";
const BLOCKED_ID = "u-010";
const USER_COUNT = 24;

type RouteHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function list(query = ""): Promise<PublicUser[]> {
  const response = await usersRoute(new Request(`${BASE}${query}`));
  expect(response.status).toBe(200);
  return response.json();
}

function post(handler: RouteHandler, id: string, path: string, body: unknown): Promise<Response> {
  return handler(new Request(`${BASE}/${id}/${path}`, { method: "POST", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
}

function patch(id: string, body: unknown): Promise<Response> {
  return patchUserRoute(new Request(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });
}

function create(body: unknown): Promise<Response> {
  return createUserRoute(new Request(BASE, { method: "POST", body: JSON.stringify(body) }));
}

/** GET /admin/audit отдаёт страницу `{ items, total, page, perPage }` (T4.2-05). */
async function audit(): Promise<AuditLogEntry[]> {
  const page: PageResponse<AuditLogEntry> = await (await auditRoute(new Request(AUDIT_URL))).json();
  return page.items;
}

function login(body: unknown): Promise<Response> {
  return loginRoute(
    new Request("http://localhost/api/mock/auth/login", { method: "POST", body: JSON.stringify(body) }),
  );
}

const NEW_STUDENT = {
  adminId: ADMIN_ID,
  fullName: "Новиков Артём Петрович",
  login: "novikov",
  password: "temp-2026",
  role: "student",
  armNumber: 25,
  group: "ДДС-01",
  service: "ДДС района Зюзино",
};

beforeEach(() => {
  resetMockStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-19T12:00:00+03:00"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/mock/admin/users — фильтры и поиск (T4.1-02)", () => {
  it("без фильтров — все учётные записи, без поля password", async () => {
    const users = await list();
    expect(users).toHaveLength(USER_COUNT);
    expect(users.every((user) => !("password" in user))).toBe(true);
  });

  it("role=student&state=blocked → u-010", async () => {
    const users = await list("?role=student&state=blocked");
    expect(users.map((user) => user.id)).toEqual([BLOCKED_ID]);
  });

  it("фильтр по группе и роли сужает список", async () => {
    const users = await list("?role=student&group=ДДС-02");
    expect(users.length).toBeGreaterThan(0);
    expect(users.every((user) => user.role === "student" && user.group === "ДДС-02")).toBe(true);
  });

  it("поиск q регистронезависим, по ФИО и по логину", async () => {
    expect((await list("?q=EGOROV")).map((user) => user.id)).toEqual([BLOCKED_ID]);
    expect((await list("?q=егоров")).map((user) => user.id)).toEqual([BLOCKED_ID]);
    expect((await list("?q=Морозова")).map((user) => user.id)).toEqual([TEACHER_ID]);
  });

  it("мусор в фильтрах role/state → 400", async () => {
    const role = await usersRoute(new Request(`${BASE}?role=director`));
    expect(role.status).toBe(400);
    expect(((await role.json()) as ApiErrorBody).error.code).toBe("validationFailed");
    expect((await usersRoute(new Request(`${BASE}?state=frozen`))).status).toBe(400);
  });
});

describe("POST /api/mock/admin/users — создание (T4.1-03)", () => {
  it("создаёт пользователя с id u-NNN, пишет аудит, созданный входит в систему", async () => {
    const response = await create(NEW_STUDENT);
    expect(response.status).toBe(201);
    const created: PublicUser = await response.json();
    expect(created.id).toMatch(/^u-\d{3}$/);
    expect(created).toMatchObject({ login: "novikov", role: "student", armNumber: 25, isActive: true });
    expect(created).not.toHaveProperty("password");
    expect((await list()).length).toBe(USER_COUNT + 1);
    expect((await audit())[0]).toMatchObject({ userId: ADMIN_ID, role: "admin", action: "user.create" });

    const signIn = await login({ login: "novikov", password: "temp-2026", armNumber: 25 });
    expect(signIn.status).toBe(200);
  });

  it("дубликат логина → 409", async () => {
    const response = await create({ ...NEW_STUDENT, login: "admin" });
    expect(response.status).toBe(409);
    expect(((await response.json()) as ApiErrorBody).error.message).toBe("Логин уже занят");
  });

  it("кириллица и пробел в логине, нулевой № АРМ → 400", async () => {
    expect((await create({ ...NEW_STUDENT, login: "новиков" })).status).toBe(400);
    expect((await create({ ...NEW_STUDENT, login: "novi kov" })).status).toBe(400);
    expect((await create({ ...NEW_STUDENT, armNumber: 0 })).status).toBe(400);
    expect((await create({ ...NEW_STUDENT, fullName: " " })).status).toBe(400);
  });

  it("не администратор → 403, без adminId → 400", async () => {
    expect((await create({ ...NEW_STUDENT, adminId: TEACHER_ID })).status).toBe(403);
    expect((await create({ ...NEW_STUDENT, adminId: undefined })).status).toBe(400);
  });

  it("ролевые поля приводятся к роли: у администратора нет группы и службы", async () => {
    const response = await create({ ...NEW_STUDENT, login: "sysop", role: "admin", armNumber: 26 });
    const created: PublicUser = await response.json();
    expect(created.group).toBeUndefined();
    expect(created.service).toBeUndefined();
  });
});

describe("PATCH /api/mock/admin/users/[id] — редактирование и смена роли (T4.1-03, T4.1-08)", () => {
  it("правка полей пишет user.update с деталями", async () => {
    const response = await patch(STUDENT_ID, { adminId: ADMIN_ID, fullName: "Иванов Сергей Петрович (2)" });
    expect(response.status).toBe(200);
    expect((await response.json()).fullName).toBe("Иванов Сергей Петрович (2)");
    const entry = (await audit())[0];
    expect(entry).toMatchObject({ userId: ADMIN_ID, action: "user.update" });
    expect(entry.details).toContain("ФИО");
  });

  it("смена роли — отдельное событие аудита, ролевые поля приводятся к новой роли", async () => {
    const response = await patch(STUDENT_ID, {
      adminId: ADMIN_ID,
      role: "teacher",
      assignedGroups: ["ДДС-01", "ДДС-02"],
    });
    expect(response.status).toBe(200);
    const updated: PublicUser = await response.json();
    expect(updated.role).toBe("teacher");
    expect(updated.group).toBeUndefined();
    expect(updated.assignedGroups).toEqual(["ДДС-01", "ДДС-02"]);
    const roleEntry = (await audit()).find((entry) => entry.action === "user.roleChange");
    expect(roleEntry?.details).toContain("«Обучающийся» → «Преподаватель»");
  });

  it("правка без изменений не засоряет журнал аудита", async () => {
    const before = (await audit()).length;
    await patch(STUDENT_ID, { adminId: ADMIN_ID });
    expect((await audit()).length).toBe(before);
  });

  it("чужой занятый логин → 409, свой же логин — без конфликта", async () => {
    expect((await patch(STUDENT_ID, { adminId: ADMIN_ID, login: "admin" })).status).toBe(409);
    expect((await patch(STUDENT_ID, { adminId: ADMIN_ID, login: "ivanov" })).status).toBe(200);
  });

  it("неизвестный id → 404, не администратор → 403", async () => {
    expect((await patch("u-999", { adminId: ADMIN_ID })).status).toBe(404);
    expect((await patch(STUDENT_ID, { adminId: STUDENT_ID })).status).toBe(403);
  });
});

describe("block / unblock / reset-password (T4.1-03, T4.1-09)", () => {
  it("block → isActive=false, аудит, отказ на /login; unblock возвращает вход", async () => {
    const blocked = await post(blockRoute, STUDENT_ID, "block", { adminId: ADMIN_ID });
    expect(blocked.status).toBe(200);
    expect((await blocked.json()).isActive).toBe(false);
    expect((await audit())[0]).toMatchObject({ userId: ADMIN_ID, action: "user.block" });

    const denied = await login({ login: "ivanov", password: "student112", armNumber: 1 });
    expect(denied.status).toBe(403);
    expect(((await denied.json()) as ApiErrorBody).error.code).toBe("accountBlocked");

    const unblocked = await post(unblockRoute, STUDENT_ID, "unblock", { adminId: ADMIN_ID });
    expect((await unblocked.json()).isActive).toBe(true);
    expect((await audit())[0]).toMatchObject({ action: "user.unblock" });
    expect((await login({ login: "ivanov", password: "student112", armNumber: 1 })).status).toBe(200);
  });

  it("администратор не блокирует сам себя → 409; неизвестный id → 404", async () => {
    expect((await post(blockRoute, ADMIN_ID, "block", { adminId: ADMIN_ID })).status).toBe(409);
    expect((await post(blockRoute, "u-999", "block", { adminId: ADMIN_ID })).status).toBe(404);
  });

  it("reset-password отдаёт временный пароль, он работает на входе, аудит записан", async () => {
    const response = await post(resetPasswordRoute, STUDENT_ID, "reset-password", { adminId: ADMIN_ID });
    expect(response.status).toBe(200);
    const body: AdminUserPasswordResetResponse = await response.json();
    expect(body.temporaryPassword).toMatch(/^arm112-\d{4}$/);
    expect(body.user).not.toHaveProperty("password");
    expect((await audit())[0]).toMatchObject({ userId: ADMIN_ID, action: "user.passwordReset" });

    expect((await login({ login: "ivanov", password: "student112", armNumber: 1 })).status).toBe(401);
    const signIn = await login({ login: "ivanov", password: body.temporaryPassword, armNumber: 1 });
    expect(signIn.status).toBe(200);
  });

  it("действия доступны только администратору (403)", async () => {
    expect((await post(blockRoute, STUDENT_ID, "block", { adminId: TEACHER_ID })).status).toBe(403);
    expect(
      (await post(resetPasswordRoute, STUDENT_ID, "reset-password", { adminId: TEACHER_ID })).status,
    ).toBe(403);
  });
});
