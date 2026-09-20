import { describe, expect, it } from "vitest";

import type { SessionContract, SystemService } from "@/shared/api";

import { hasRunningSession, isBackupStale, isServiceActionLocked } from "./session-guard";

const session = (state: SessionContract["state"]): SessionContract =>
  ({ id: `ses-${state}`, state }) as unknown as SessionContract;

const service = (patch: Partial<SystemService>): SystemService => ({
  id: "svc-db",
  name: "БД PostgreSQL",
  state: "running",
  uptimeSec: 10,
  critical: true,
  description: "",
  ...patch,
});

const NOW = Date.parse("2026-09-17T12:00:00+03:00");

describe("session-guard", () => {
  it("занятие идёт только в состоянии running", () => {
    expect(hasRunningSession([session("running")])).toBe(true);
    expect(hasRunningSession([session("finished"), session("draft")])).toBe(false);
    expect(hasRunningSession([session("configured"), session("reported")])).toBe(false);
    expect(hasRunningSession([])).toBe(false);
  });

  it("во время занятия у критичного сервиса заблокированы остановка и перезапуск", () => {
    const db = service({});
    expect(isServiceActionLocked(db, "stop", true)).toBe(true);
    expect(isServiceActionLocked(db, "restart", true)).toBe(true);
    expect(isServiceActionLocked(db, "start", true)).toBe(false);
    expect(isServiceActionLocked(db, "stop", false)).toBe(false);
    expect(isServiceActionLocked(service({ critical: false }), "stop", true)).toBe(false);
  });

  it("бэкап старше 24 часов — предупреждение", () => {
    expect(isBackupStale("2026-09-17T03:00:00+03:00", NOW)).toBe(false);
    expect(isBackupStale("2026-09-16T11:00:00+03:00", NOW)).toBe(true);
    expect(isBackupStale("", NOW)).toBe(true);
  });
});
