// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";

import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { PATCH as patchSettingsRoute } from "../../../../../app/api/mock/admin/system/settings/route";
import { POST } from "../../../../../app/api/mock/auth/login/route";
import { GET as policyRoute } from "../../../../../app/api/mock/auth/policy/route";
import type { ApiErrorBody, AuditLogEntry, AuthPolicy, AuthSession, PageResponse } from "../../types";
import { resetMockStore } from "../store";
import { updateStoredUser } from "../store-admin";

const URL = "http://localhost/api/mock/auth/login";
const EMPTY_PASSWORD = { login: "ivanov", password: "", armNumber: 1 };
/** Последний id сида mocks/admin/audit-log.json: всё, что больше, — рантайм-события. */
const SEED_AUDIT_MAX = 22;

function login(body: unknown): Promise<Response> {
  return POST(new Request(URL, { method: "POST", body: JSON.stringify(body) }));
}

async function readError(response: Response): Promise<ApiErrorBody["error"]> {
  return ((await response.json()) as ApiErrorBody).error;
}

/** Рантайм-записи журнала аудита заданного типа (сид «входов» датирован прошлым — фильтруем по id). */
async function listAudit(type: string): Promise<AuditLogEntry[]> {
  const url = `http://localhost/api/mock/admin/audit?type=${type}&perPage=100`;
  const page: PageResponse<AuditLogEntry> = await (await auditRoute(new Request(url))).json();
  return page.items.filter((entry) => Number(entry.id.replace("audit-", "")) > SEED_AUDIT_MAX);
}

beforeEach(() => {
  resetMockStore();
});

describe("POST /api/mock/auth/login", () => {
  const valid = { login: "admin", password: "admin112", armNumber: 24 };

  it("успех → 200 AuthSession без пароля", async () => {
    const response = await login(valid);
    expect(response.status).toBe(200);
    const session: AuthSession = await response.json();
    expect(session).toMatchObject({ userId: "u-001", role: "admin", twoFactorUsed: false });
    expect(session.token).toMatch(/^mock-u-001-/);
    expect(session.issuedAt).toMatch(/\+03:00$/);
    expect(JSON.stringify(session)).not.toContain("admin112");
  });

  it("неверный пароль → 401 «Неверный логин или пароль»", async () => {
    const response = await login({ ...valid, password: "wrong" });
    expect(response.status).toBe(401);
    expect(await readError(response)).toEqual({ code: "unauthorized", message: "Неверный логин или пароль" });
  });

  it("mismatch armNumber → 401 без уточнений", async () => {
    const response = await login({ ...valid, armNumber: 5 });
    expect(response.status).toBe(401);
    expect((await readError(response)).message).toBe("Неверный логин или пароль");
  });

  it("заблокированная учётка (u-010 egorov) → 403", async () => {
    const response = await login({ login: "egorov", password: "student112", armNumber: 6 });
    expect(response.status).toBe(403);
    expect(await readError(response)).toEqual({
      code: "accountBlocked",
      message: "Учётная запись заблокирована. Обратитесь к администратору",
    });
  });

  it("блокировка администратором в store учитывается при входе", async () => {
    updateStoredUser("u-001", (draft) => {
      draft.isActive = false;
    });
    expect((await login(valid)).status).toBe(403);
  });

  it("поле 2FA отклоняется при любом значении", async () => {
    expect((await login({ ...valid, twoFactorCode: "123456" })).status).toBe(400);
    expect((await login({ ...valid, twoFactorCode: null })).status).toBe(400);
  });

  it("пустые поля → 400", async () => {
    expect((await login(EMPTY_PASSWORD)).status).toBe(400);
  });
});

describe("GET /api/mock/auth/policy — политика входа (T4.2-17)", () => {
  const valid = { login: "admin", password: "admin112", armNumber: 24 };

  async function policy(): Promise<AuthPolicy> {
    return (await policyRoute()).json();
  }

  function patchSecurity(security: Record<string, unknown>): Promise<Response> {
    const url = "http://localhost/api/mock/admin/system/settings";
    return patchSettingsRoute(new Request(url, { method: "PATCH", body: JSON.stringify({ security }) }));
  }

  it("отдаёт блок security настроек системы", async () => {
    expect(await policy()).toEqual({
      twoFactorRequired: false,
      minPasswordLength: expect.any(Number),
      lockAfterAttempts: expect.any(Number),
    });
  });

  it("попытка включить несуществующую 2FA отклоняется", async () => {
    expect((await patchSecurity({ require2fa: true })).status).toBe(422);
    expect((await policy()).twoFactorRequired).toBe(false);
  });

  it("успешный парольный вход пишется в журнал аудита", async () => {
    await login(valid);
    const entries = await listAudit("login");
    expect(entries[0]).toMatchObject({ userId: "u-001", role: "admin", action: "auth.login" });
    expect(entries[0].operatorArm).toBe(24);
  });
});
