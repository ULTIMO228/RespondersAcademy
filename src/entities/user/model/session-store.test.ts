import { describe, expect, it } from "vitest";

import type { AuthSession } from "@/shared/api";
import { createMemoryStorage } from "@/shared/lib";
import type { Clock } from "@/shared/lib";

import { parseSession, serializeSession, SESSION_COOKIE, SESSION_TTL_MS } from "./session";
import { createSessionStore } from "./session-store";

const ISSUED_AT = "2026-09-17T11:13:19+03:00";
const ISSUED_AT_MS = Date.parse(ISSUED_AT);
const HOUR_MS = 3_600_000;

const SESSION: AuthSession = {
  userId: "u-005",
  role: "student",
  token: "mock-u-005-abc",
  twoFactorUsed: true,
  issuedAt: ISSUED_AT,
};

function fixedClock(nowMs: number): Clock {
  return { now: () => nowMs, setTimeout, clearTimeout };
}

describe("createSessionStore", () => {
  it("set → стор отдаёт userId/role/token и пишет сессию в хранилище", () => {
    const storage = createMemoryStorage();
    const store = createSessionStore({ storage, clock: fixedClock(ISSUED_AT_MS) });
    store.set(SESSION);
    expect(store.get()).toMatchObject({ userId: "u-005", role: "student", token: "mock-u-005-abc" });
    expect(parseSession(storage.get(SESSION_COOKIE))).toEqual(SESSION);
  });

  it("restore: «перезагрузка страницы» — новый стор над тем же хранилищем восстанавливает сессию", () => {
    const storage = createMemoryStorage();
    createSessionStore({ storage, clock: fixedClock(ISSUED_AT_MS) }).set(SESSION);
    const reloaded = createSessionStore({ storage, clock: fixedClock(ISSUED_AT_MS + HOUR_MS) });
    expect(reloaded.get()).toEqual(SESSION);
  });

  it("clear → сессии нет ни в сторе, ни после восстановления; подписчики уведомлены", () => {
    const storage = createMemoryStorage();
    const store = createSessionStore({ storage, clock: fixedClock(ISSUED_AT_MS) });
    let notifications = 0;
    const unsubscribe = store.subscribe(() => (notifications += 1));
    store.set(SESSION);
    store.clear();
    unsubscribe();
    expect(store.get()).toBeNull();
    expect(createSessionStore({ storage }).restore()).toBeNull();
    expect(notifications).toBe(2);
  });

  it("истёкшая (≥ 24 ч) сессия при восстановлении удаляется", () => {
    const storage = createMemoryStorage({ [SESSION_COOKIE]: serializeSession(SESSION) });
    const store = createSessionStore({ storage, clock: fixedClock(ISSUED_AT_MS + SESSION_TTL_MS) });
    expect(store.get()).toBeNull();
    expect(storage.get(SESSION_COOKIE)).toBeNull();
  });

  it("битое значение в хранилище → null", () => {
    const storage = createMemoryStorage({ [SESSION_COOKIE]: "{not json" });
    expect(createSessionStore({ storage }).get()).toBeNull();
  });
});

describe("parseSession", () => {
  it("принимает URL-кодированное значение cookie и отбрасывает лишние/чужие поля", () => {
    const encoded = encodeURIComponent(JSON.stringify({ ...SESSION, password: "x" }));
    expect(parseSession(encoded)).toMatchObject(SESSION);
    expect(parseSession(JSON.stringify({ ...SESSION, role: "root" }))).toBeNull();
    expect(serializeSession({ ...SESSION, extra: 1 } as AuthSession)).not.toContain("extra");
  });
});
