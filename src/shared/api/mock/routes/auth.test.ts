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

  it("2FA: 6 цифр принят (twoFactorUsed), 5 цифр → 400", async () => {
    const ok = await login({ ...valid, twoFactorCode: "123456" });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as AuthSession).twoFactorUsed).toBe(true);
    const bad = await login({ ...valid, twoFactorCode: "12345" });
    expect(bad.status).toBe(400);
    expect((await readError(bad)).code).toBe("validationFailed");
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
      twoFactorRequired: true,
      minPasswordLength: expect.any(Number),
      lockAfterAttempts: expect.any(Number),
    });
  });

  it("администратор выключает «Требовать 2FA» → политика меняется для /login", async () => {
    expect((await patchSecurity({ require2fa: false })).status).toBe(200);
    expect((await policy()).twoFactorRequired).toBe(false);
  });

  it("завершённый вход пишется в журнал аудита, незавершённый шаг 2FA — нет", async () => {
    await login(valid);
    expect((await listAudit("login")).length).toBe(0);
    await login({ ...valid, twoFactorCode: "123456" });
    const entries = await listAudit("login");
    expect(entries[0]).toMatchObject({ userId: "u-001", role: "admin", action: "auth.login" });
    expect(entries[0].operatorArm).toBe(24);
  });

  it("при выключенной 2FA вход пишется в аудит сразу", async () => {
    await patchSecurity({ require2fa: false });
    await login(valid);
    expect((await listAudit("login"))[0]).toMatchObject({ action: "auth.login", userId: "u-001" });
  });
});
