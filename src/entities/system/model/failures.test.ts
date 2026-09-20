import { describe, expect, it } from "vitest";

import type { SystemLogEntry, SystemService } from "@/shared/api";

import { describeSource, hasActiveFailure, listCriticalEvents } from "./failures";

function service(patch: Partial<SystemService>): SystemService {
  return {
    id: "svc-x",
    name: "Сервис",
    state: "running",
    uptimeSec: 100,
    critical: false,
    description: "",
    ...patch,
  };
}

describe("активные сбои и критические события", () => {
  it("сбой — degraded или остановленный критичный сервис", () => {
    expect(hasActiveFailure([service({}), service({ id: "svc-y", state: "stopped" })])).toBe(false);
    expect(hasActiveFailure([service({ state: "degraded" })])).toBe(true);
    expect(hasActiveFailure([service({ state: "stopped", critical: true })])).toBe(true);
  });

  it("лента критических событий — только ERROR", () => {
    const logs: SystemLogEntry[] = [
      { id: "log-2", at: "2026-09-17T11:00:00+03:00", level: "ERROR", source: "svc-web", message: "сбой" },
      { id: "log-1", at: "2026-09-17T10:00:00+03:00", level: "WARN", source: "svc-web", message: "порог" },
    ];
    expect(listCriticalEvents(logs).map((entry) => entry.id)).toEqual(["log-2"]);
  });

  it("источник события подписывается названием сервиса", () => {
    const services = [service({ id: "svc-db", name: "БД PostgreSQL" })];
    expect(describeSource(services, "svc-db")).toBe("БД PostgreSQL");
    expect(describeSource(services, "svc-backup")).toBe("svc-backup");
  });
});
