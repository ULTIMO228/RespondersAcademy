// @vitest-environment node
/*
 * T4.1-04: клиент реестра пользователей поверх реальных route handlers мок-слоя (без сети).
 * Проверяем сборку query-строки фильтров, транспорт мутаций и маппинг ошибок в доменные результаты.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../client";
import {
  handleGetAdminUsers,
  handlePatchAdminUser,
  handlePostAdminUser,
  handlePostAdminUserBlock,
  handlePostAdminUserResetPassword,
  handlePostAdminUserUnblock,
} from "../mock/routes";
import { resetMockStore } from "../mock/store";
import {
  ADMIN_USER_FAILURE_MESSAGES,
  adminCreateUser,
  adminListUsers,
  adminResetUserPassword,
  adminSetUserActive,
  adminSetUserRole,
  adminUpdateUser,
  mapAdminUserError,
} from "./admin-users";

const ADMIN_ID = "u-001";
const STUDENT_ID = "u-005";
const BLOCKED_ID = "u-010";
const USER_ID_SEGMENT = /\/admin\/users\/([^/?]+)/;

/** Запросы клиента (относительные пути) → те же handlers, что и в Next. */
const requestedUrls: string[] = [];

async function routeRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = String(input);
  requestedUrls.push(path);
  const request = new Request(`http://localhost${path}`, init);
  const id = USER_ID_SEGMENT.exec(path)?.[1] ?? "";
  const context = { params: Promise.resolve({ id }) };
  if (path.endsWith("/block")) return handlePostAdminUserBlock(request, context);
  if (path.endsWith("/unblock")) return handlePostAdminUserUnblock(request, context);
  if (path.endsWith("/reset-password")) return handlePostAdminUserResetPassword(request, context);
  if (init?.method === "PATCH") return handlePatchAdminUser(request, context);
  if (init?.method === "POST") return handlePostAdminUser(request);
  return handleGetAdminUsers(request);
}

async function captureError(action: Promise<unknown>): Promise<unknown> {
  try {
    await action;
  } catch (error) {
    return error;
  }
  throw new Error("ожидалась ошибка");
}

beforeEach(() => {
  resetMockStore();
  requestedUrls.length = 0;
  vi.stubGlobal("fetch", routeRequest);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("adminListUsers()", () => {
  it("фильтры уходят в query-строку, пустые значения опускаются", async () => {
    const users = await adminListUsers({ role: "student", state: "blocked", group: "", q: "" });
    expect(requestedUrls[0]).toBe("/api/mock/admin/users?role=student&state=blocked");
    expect(users.map((user) => user.id)).toEqual([BLOCKED_ID]);
  });

  it("поиск по ФИО кодируется (кириллица)", async () => {
    const users = await adminListUsers({ q: "Морозова" });
    expect(requestedUrls[0]).toContain("q=%D0%9C%D0%BE%D1%80%D0%BE%D0%B7%D0%BE%D0%B2%D0%B0");
    expect(users).toHaveLength(1);
  });
});

describe("мутации реестра", () => {
  const draft = {
    adminId: ADMIN_ID,
    fullName: "Новиков Артём Петрович",
    login: "novikov",
    password: "temp-2026",
    role: "student" as const,
    armNumber: 25,
    group: "ДДС-01",
  };

  it("adminCreateUser → созданный пользователь без password", async () => {
    const created = await adminCreateUser(draft);
    expect(created).toMatchObject({ login: "novikov", role: "student", isActive: true });
    expect(created).not.toHaveProperty("password");
  });

  it("adminUpdateUser правит поля, adminSetUserRole меняет роль", async () => {
    const updated = await adminUpdateUser(STUDENT_ID, { adminId: ADMIN_ID, armNumber: 31 });
    expect(updated.armNumber).toBe(31);
    const promoted = await adminSetUserRole(STUDENT_ID, "teacher", ADMIN_ID, {
      assignedGroups: ["ДДС-01"],
    });
    expect(promoted.role).toBe("teacher");
    expect(promoted.assignedGroups).toEqual(["ДДС-01"]);
  });

  it("adminSetUserActive выбирает block/unblock по флагу", async () => {
    expect((await adminSetUserActive(STUDENT_ID, false, ADMIN_ID)).isActive).toBe(false);
    expect(requestedUrls.at(-1)).toBe(`/api/mock/admin/users/${STUDENT_ID}/block`);
    expect((await adminSetUserActive(STUDENT_ID, true, ADMIN_ID)).isActive).toBe(true);
    expect(requestedUrls.at(-1)).toBe(`/api/mock/admin/users/${STUDENT_ID}/unblock`);
  });

  it("adminResetUserPassword отдаёт временный пароль", async () => {
    const result = await adminResetUserPassword(STUDENT_ID, ADMIN_ID);
    expect(result.temporaryPassword).toMatch(/^arm112-\d{4}$/);
    expect(result.user.id).toBe(STUDENT_ID);
  });
});

describe("mapAdminUserError()", () => {
  it("409 → «логин занят» с указанием поля формы", async () => {
    const error = await captureError(
      adminCreateUser({
        adminId: ADMIN_ID,
        fullName: "Дубль Логина Тестович",
        login: "admin",
        password: "x",
        role: "admin",
        armNumber: 77,
      }),
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(mapAdminUserError(error)).toEqual({
      reason: "loginTaken",
      field: "login",
      message: ADMIN_USER_FAILURE_MESSAGES.loginTaken,
    });
  });

  it("400 → текст валидации мок-слоя; 403 и 404 → доменные сообщения", async () => {
    const validation = await captureError(
      adminCreateUser({
        adminId: ADMIN_ID,
        fullName: "Кириллица Логина Тестович",
        login: "новиков",
        password: "x",
        role: "student",
        armNumber: 78,
      }),
    );
    expect(mapAdminUserError(validation)).toMatchObject({ reason: "validation" });
    expect((mapAdminUserError(validation) as { message: string }).message).toMatch(/латиница/);

    const forbidden = await captureError(adminSetUserActive(STUDENT_ID, false, STUDENT_ID));
    expect(mapAdminUserError(forbidden)).toEqual({
      reason: "forbidden",
      message: ADMIN_USER_FAILURE_MESSAGES.forbidden,
    });

    const missing = await captureError(adminUpdateUser("u-999", { adminId: ADMIN_ID, armNumber: 5 }));
    expect(mapAdminUserError(missing)).toEqual({
      reason: "notFound",
      message: ADMIN_USER_FAILURE_MESSAGES.notFound,
    });
  });

  it("не-ApiError → «unknown»", () => {
    expect(mapAdminUserError(new Error("boom"))).toEqual({
      reason: "unknown",
      message: ADMIN_USER_FAILURE_MESSAGES.unknown,
    });
  });
});
