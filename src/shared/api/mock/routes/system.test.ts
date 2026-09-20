// @vitest-environment node
/*
 * Эндпоинты раздела «Система» (T4.2-03, T4.2-04, T4.2-05) на реальных route handlers:
 * действия над сервисами, настройки с нормативами ТЗ (422), журналы, мониторинг и статистика.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { GET as auditRoute } from "../../../../../app/api/mock/admin/audit/route";
import { GET as logsRoute } from "../../../../../app/api/mock/admin/system/logs/route";
import { GET as monitoringRoute } from "../../../../../app/api/mock/admin/system/monitoring/route";
import { POST as actionRoute } from "../../../../../app/api/mock/admin/system/services/[id]/action/route";
import { GET as servicesRoute } from "../../../../../app/api/mock/admin/system/services/route";
import {
  GET as settingsRoute,
  PATCH as patchRoute,
} from "../../../../../app/api/mock/admin/system/settings/route";
import { GET as usageRoute } from "../../../../../app/api/mock/admin/system/usage-stats/route";
import { POST as sessionStopRoute } from "../../../../../app/api/mock/sessions/[id]/stop/route";
import type {
  ApiErrorBody,
  AuditLogEntry,
  PageResponse,
  SystemLogEntry,
  SystemMonitoring,
  SystemServicesResponse,
  SystemSettings,
  UsageStats,
} from "../../types";
import { SETTINGS_NORMS } from "../../validation/settings";
import { resetMockStore } from "../store";

const BASE = "http://localhost/api/mock";
const ADMIN_ID = "u-001";
const RUNNING_SESSION = "ses-2026-09-17-demo";
const WEB = "svc-web";
const DB = "svc-db";
const SIP = "svc-sip";
const AI = "svc-ai";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function serviceAction(id: string, body: unknown): Promise<Response> {
  const url = `${BASE}/admin/system/services/${id}/action`;
  return actionRoute(new Request(url, { method: "POST", body: JSON.stringify(body) }), params(id));
}

function patchSettings(body: unknown): Promise<Response> {
  const url = `${BASE}/admin/system/settings`;
  return patchRoute(new Request(url, { method: "PATCH", body: JSON.stringify(body) }));
}

async function services(): Promise<SystemServicesResponse> {
  return (await servicesRoute()).json();
}

async function settings(): Promise<SystemSettings> {
  return (await settingsRoute()).json();
}

async function audit(query = ""): Promise<PageResponse<AuditLogEntry>> {
  return (await auditRoute(new Request(`${BASE}/admin/audit${query}`))).json();
}

/** Останавливает демо-занятие: снимает блокировку действий над критичными сервисами (ТЗ §8). */
function stopRunningSession(): Promise<Response> {
  const url = `${BASE}/sessions/${RUNNING_SESSION}/stop`;
  return sessionStopRoute(new Request(url, { method: "POST" }), params(RUNNING_SESSION));
}

beforeEach(() => {
  resetMockStore();
});

describe("GET /admin/system/services", () => {
  it("4 сервиса мока, все три состояния и сводка целостности", async () => {
    const body = await services();
    expect(body.services).toHaveLength(4);
    expect(new Set(body.services.map((service) => service.state))).toEqual(
      new Set(["running", "stopped", "degraded"]),
    );
    expect(body.services.find((service) => service.id === DB)?.critical).toBe(true);
    expect(body.integrity).toMatchObject({ ok: true });
    expect(body.integrity.checkedAt).toMatch(/\+03:00$/);
  });
});

describe("POST /admin/system/services/[id]/action", () => {
  it("stop → stopped, start → running с обнулением аптайма", async () => {
    expect((await serviceAction(AI, { action: "start", adminId: ADMIN_ID })).status).toBe(200);
    const started = (await services()).services.find((service) => service.id === AI);
    expect(started).toMatchObject({ state: "running", uptimeSec: 0 });
    await serviceAction(AI, { action: "stop", adminId: ADMIN_ID });
    expect((await services()).services.find((service) => service.id === AI)).toMatchObject({
      state: "stopped",
      uptimeSec: 0,
    });
  });

  it("degraded → restart → running", async () => {
    const before = (await services()).services.find((service) => service.id === SIP);
    expect(before?.state).toBe("degraded");
    await serviceAction(SIP, { action: "restart", adminId: ADMIN_ID });
    expect((await services()).services.find((service) => service.id === SIP)).toMatchObject({
      state: "running",
      uptimeSec: 0,
    });
  });

  it("start идемпотентен: повторный запуск не роняет состояние", async () => {
    await serviceAction(AI, { action: "start", adminId: ADMIN_ID });
    await serviceAction(AI, { action: "start", adminId: ADMIN_ID });
    expect((await services()).services.find((service) => service.id === AI)?.state).toBe("running");
  });

  it("действие пишется в журнал аудита и в системные журналы", async () => {
    await serviceAction(AI, { action: "start", adminId: ADMIN_ID });
    const entry = (await audit()).items[0];
    expect(entry).toMatchObject({ userId: ADMIN_ID, action: "service.action" });
    expect(entry.details).toContain("ИИ-модуль");
    const logs: SystemLogEntry[] = await (await logsRoute(new Request(`${BASE}/admin/system/logs`))).json();
    expect(logs[0].source).toBe(AI);
  });

  it("невалидное действие — 400, неизвестный сервис — 404", async () => {
    const bad = await serviceAction(AI, { action: "reboot" });
    expect(bad.status).toBe(400);
    const error: ApiErrorBody = await bad.json();
    expect(error.error.code).toBe("validationFailed");
    expect(error.error.message).toMatch(/[А-Яа-яЁё]/);
    expect((await serviceAction("svc-nope", { action: "start" })).status).toBe(404);
  });

  it("во время идущего занятия остановка критичного сервиса — 409, после завершения — 200", async () => {
    const blocked = await serviceAction(DB, { action: "stop", adminId: ADMIN_ID });
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as ApiErrorBody).error.message).toContain("активного занятия");
    expect((await services()).services.find((service) => service.id === DB)?.state).toBe("running");
    expect((await stopRunningSession()).status).toBe(200);
    expect((await serviceAction(DB, { action: "stop", adminId: ADMIN_ID })).status).toBe(200);
    expect((await services()).services.find((service) => service.id === DB)?.state).toBe("stopped");
  });

  it("некритичный сервис останавливается и во время занятия", async () => {
    expect((await serviceAction(WEB, { action: "start", adminId: ADMIN_ID })).status).toBe(200);
    expect((await serviceAction(SIP, { action: "stop", adminId: ADMIN_ID })).status).toBe(200);
  });
});

describe("GET/PATCH /admin/system/settings", () => {
  it("дефолты мока проходят нормативы ТЗ", async () => {
    const body = await settings();
    expect(body.backup.periodHours).toBeLessThanOrEqual(SETTINGS_NORMS.backupMaxPeriodHours);
    expect(body.logging.retentionMonths).toBeGreaterThanOrEqual(SETTINGS_NORMS.loggingMinRetentionMonths);
    expect(body.performance.sessionLimit).toBeGreaterThanOrEqual(SETTINGS_NORMS.sessionLimitMin);
  });

  it("periodHours=48 → 422 со списком полей; 12 → 200 и читается обратно", async () => {
    const rejected = await patchSettings({ backup: { periodHours: 48 }, adminId: ADMIN_ID });
    expect(rejected.status).toBe(422);
    const error: ApiErrorBody = await rejected.json();
    expect(error.error.code).toBe("validationFailed");
    expect(error.error.message).toContain("1 раза в сутки");
    expect((await settings()).backup.periodHours).toBe(24);

    const accepted = await patchSettings({ backup: { periodHours: 12 }, adminId: ADMIN_ID });
    expect(accepted.status).toBe(200);
    expect((await settings()).backup.periodHours).toBe(12);
  });

  it("смена настроек пишется в журнал аудита", async () => {
    await patchSettings({ performance: { sessionLimit: 25 }, adminId: ADMIN_ID });
    const entry = (await audit("?type=settings")).items[0];
    expect(entry).toMatchObject({ userId: ADMIN_ID, action: "settings.update" });
    expect(entry.details).toContain("sessionLimit");
  });

  it("обновление lastAt — это «Выполнить сейчас»: событие «бэкап» в аудите", async () => {
    const lastAt = "2026-09-20T09:00:00+03:00";
    expect((await patchSettings({ backup: { lastAt }, adminId: ADMIN_ID })).status).toBe(200);
    expect((await settings()).backup.lastAt).toBe(lastAt);
    expect((await audit("?type=backup")).items[0]).toMatchObject({ action: "backup.run" });
  });

  it("журналы < 6 мес и лимит сессий < 20 отклоняются", async () => {
    expect((await patchSettings({ logging: { retentionMonths: 3 } })).status).toBe(422);
    expect((await patchSettings({ performance: { sessionLimit: 10 } })).status).toBe(422);
    expect((await patchSettings({ performance: { sessionLimit: 20 } })).status).toBe(200);
  });

  it("database не изменяется через PATCH (read-only)", async () => {
    const before = (await settings()).database;
    await patchSettings({ database: { host: "hacked.local", name: "hacked" } });
    expect((await settings()).database).toEqual(before);
  });
});

describe("GET /admin/system/logs", () => {
  async function logs(query = ""): Promise<SystemLogEntry[]> {
    return (await logsRoute(new Request(`${BASE}/admin/system/logs${query}`))).json();
  }

  it("лента новых сверху со всеми уровнями", async () => {
    const all = await logs();
    expect(all.length).toBeGreaterThan(0);
    expect(new Set(all.map((entry) => entry.level))).toEqual(new Set(["INFO", "WARN", "ERROR"]));
    const times = all.map((entry) => Date.parse(entry.at));
    expect([...times].sort((left, right) => right - left)).toEqual(times);
  });

  it("фильтр ERROR — только ошибки; мусор в level — 400", async () => {
    const errors = await logs("?level=ERROR");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((entry) => entry.level === "ERROR")).toBe(true);
    expect((await logsRoute(new Request(`${BASE}/admin/system/logs?level=TRACE`))).status).toBe(400);
  });
});

describe("GET /admin/system/monitoring и /usage-stats", () => {
  it("ряды покрывают 24 ч и содержат участки выхода за нормативы", async () => {
    const body: SystemMonitoring = await (await monitoringRoute()).json();
    expect(body.windowHours).toBeGreaterThanOrEqual(24);
    const points = (body.windowHours * 60) / body.stepMinutes + 1;
    expect(body.labels).toHaveLength(points);
    for (const series of Object.values(body.series)) expect(series).toHaveLength(points);
    expect(Math.max(...body.series.activeSessions)).toBeGreaterThan(body.norms.sessionLimit);
    expect(Math.max(...body.series.responseSec)).toBeGreaterThan(body.norms.responseSec);
  });

  it("статистика: период week/month, мусор — 400", async () => {
    const url = `${BASE}/admin/system/usage-stats`;
    const all: UsageStats = await (await usageRoute(new Request(url))).json();
    expect(all.periods.map((period) => period.id)).toEqual(["week", "month"]);
    const month: UsageStats = await (await usageRoute(new Request(`${url}?period=month`))).json();
    expect(month.periods).toHaveLength(1);
    expect(month.periods[0].loginsByRole.labels).toContain("Преподаватель");
    expect((await usageRoute(new Request(`${url}?period=year`))).status).toBe(400);
  });
});

describe("GET /admin/audit — фильтры и пагинация", () => {
  it("формат ответа единый со списками проекта", async () => {
    const page = await audit();
    expect(Object.keys(page).sort()).toEqual(["items", "page", "perPage", "total"]);
    expect(page.page).toBe(1);
    expect(page.total).toBeGreaterThan(page.items.length);
  });

  it("фильтр «по карточке» отдаёт только записи с cardId", async () => {
    const page = await audit("?card=c-014");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((entry) => entry.cardId === "c-014")).toBe(true);
  });

  it("тип события «Нарушения исправлены» ищется среди событий карточек", async () => {
    const page = await audit("?type=card&q=нарушения");
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((entry) => entry.action.startsWith("card."))).toBe(true);
    expect(page.items.some((entry) => entry.action === "card.violationsFixed")).toBe(true);
  });

  it("фильтр по оператору и период", async () => {
    const byOperator = await audit("?operator=u-001");
    expect(byOperator.items.every((entry) => entry.userId === "u-001")).toBe(true);
    const period = await audit("?from=2026-09-19T00:00:00%2B03:00&to=2026-09-19T23:59:59%2B03:00");
    expect(period.items.length).toBeGreaterThan(0);
    expect(period.items.every((entry) => entry.at.startsWith("2026-09-19"))).toBe(true);
  });

  it("page=2 листает и не пересекается с первой страницей", async () => {
    const first = await audit("?perPage=5&page=1");
    const second = await audit("?perPage=5&page=2");
    expect(first.items).toHaveLength(5);
    expect(second.page).toBe(2);
    const ids = new Set(first.items.map((entry) => entry.id));
    expect(second.items.some((entry) => ids.has(entry.id))).toBe(false);
  });

  it("мусор в фильтрах — 400 с ru-сообщением", async () => {
    const response = await auditRoute(new Request(`${BASE}/admin/audit?type=nope`));
    expect(response.status).toBe(400);
    expect(((await response.json()) as ApiErrorBody).error.message).toMatch(/[А-Яа-яЁё]/);
    expect((await auditRoute(new Request(`${BASE}/admin/audit?from=вчера`))).status).toBe(400);
  });
});
