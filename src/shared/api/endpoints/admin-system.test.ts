// @vitest-environment node
/*
 * T4.2-06: клиент `adminSystemApi` поверх реальных route handlers мок-слоя (без сети).
 * Проверяем пути и query-строки, транспорт PATCH настроек и действий над сервисами,
 * а также проброс ошибок мок-слоя (422 нормативов ТЗ, 400 мусора в фильтрах) в ApiError.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../client";
import {
  handleGetAuditLog,
  handleGetSystemLogs,
  handleGetSystemMonitoring,
  handleGetSystemServices,
  handleGetSystemSettings,
  handleGetSystemUsageStats,
  handlePatchSystemSettings,
  handlePostSystemServiceAction,
} from "../mock/routes";
import { resetMockStore } from "../mock/store";
import { adminSystemApi } from "./admin-system";

const ADMIN_ID = "u-001";
const SERVICE_ID_SEGMENT = /\/system\/services\/([^/?]+)\/action/;

/** Запросы клиента (относительные пути) → те же handlers, что и в Next. */
const requestedUrls: string[] = [];

async function routeRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = String(input);
  requestedUrls.push(path);
  const request = new Request(`http://localhost${path}`, init);
  const serviceId = SERVICE_ID_SEGMENT.exec(path)?.[1] ?? "";
  if (serviceId) {
    return handlePostSystemServiceAction(request, { params: Promise.resolve({ id: serviceId }) });
  }
  if (path.includes("/admin/audit")) return handleGetAuditLog(request);
  if (path.includes("/system/logs")) return handleGetSystemLogs(request);
  if (path.includes("/system/monitoring")) return handleGetSystemMonitoring();
  if (path.includes("/system/usage-stats")) return handleGetSystemUsageStats(request);
  if (path.includes("/system/settings")) {
    return init?.method === "PATCH" ? handlePatchSystemSettings(request) : handleGetSystemSettings();
  }
  return handleGetSystemServices();
}

async function captureError(action: Promise<unknown>): Promise<ApiError> {
  try {
    await action;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
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

describe("сервисы", () => {
  it("getServices → плитки и сводка целостности по пути /admin/system/services", async () => {
    const response = await adminSystemApi.getServices();
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/services");
    expect(response.services).toHaveLength(4);
    expect(response.integrity.ok).toBe(true);
  });

  it("serviceAction → POST с телом {action, adminId}, состояние обновлено", async () => {
    const response = await adminSystemApi.serviceAction("svc-ai", "start", ADMIN_ID);
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/services/svc-ai/action");
    expect(response.services.find((service) => service.id === "svc-ai")?.state).toBe("running");
  });

  it("запрет во время активного занятия приходит как ApiError 409", async () => {
    const error = await captureError(adminSystemApi.serviceAction("svc-db", "stop", ADMIN_ID));
    expect(error.status).toBe(409);
    expect(error.message).toContain("активного занятия");
  });
});

describe("настройки", () => {
  it("getSettings → секции 05 §9 и app-расширения", async () => {
    const settings = await adminSystemApi.getSettings();
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/settings");
    expect(Object.keys(settings)).toContain("performance");
  });

  it("patchSettings сохраняет и читается обратно", async () => {
    await adminSystemApi.patchSettings({ backup: { periodHours: 12 }, adminId: ADMIN_ID });
    expect((await adminSystemApi.getSettings()).backup.periodHours).toBe(12);
  });

  it("нарушение норматива ТЗ → ApiError 422 с текстом норматива", async () => {
    const error = await captureError(adminSystemApi.patchSettings({ performance: { sessionLimit: 10 } }));
    expect(error.status).toBe(422);
    expect(error.message).toContain("20 одновременных сессий");
  });
});

describe("мониторинг, статистика и журналы", () => {
  it("getMonitoring → ряды и нормативы", async () => {
    const monitoring = await adminSystemApi.getMonitoring();
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/monitoring");
    expect(monitoring.norms).toEqual({ sessionLimit: 20, responseSec: 2 });
  });

  it("getUsageStats кладёт период в query", async () => {
    const stats = await adminSystemApi.getUsageStats({ period: "month" });
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/usage-stats?period=month");
    expect(stats.periods).toHaveLength(1);
  });

  it("getLogs кладёт уровень в query и отдаёт только его", async () => {
    const logs = await adminSystemApi.getLogs({ level: "ERROR" });
    expect(requestedUrls[0]).toBe("/api/mock/admin/system/logs?level=ERROR");
    expect(logs.every((entry) => entry.level === "ERROR")).toBe(true);
  });

  it("getAudit кодирует фильтры (кириллица) и отдаёт страницу", async () => {
    const page = await adminSystemApi.getAudit({ type: "card", q: "нарушения", page: 1, perPage: 5 });
    expect(requestedUrls[0]).toContain("type=card");
    expect(requestedUrls[0]).toContain("q=%D0%BD%D0%B0%D1%80%D1%83%D1%88%D0%B5%D0%BD%D0%B8%D1%8F");
    expect(page.perPage).toBe(5);
    expect(page.items.some((entry) => entry.action === "card.violationsFixed")).toBe(true);
  });

  it("мусор в фильтре журнала → ApiError 400 с ru-сообщением", async () => {
    const error = await captureError(
      adminSystemApi.getAudit({ type: "nope" } as unknown as { type: undefined }),
    );
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/[А-Яа-яЁё]/);
  });
});
