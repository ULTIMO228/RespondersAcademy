/* Route handlers /api/mock/admin/system/* (тонкие: логика — ../system.ts, ../system-audit.ts). */
import type { RouteContext } from "../request";
import { readSearchParams } from "../request";
import { jsonOk, withErrorHandling } from "../respond";
import { getMonitoring, getSystemLogs, getSystemServices, getSystemSettings } from "../system";
import { getUsageStats, patchSystemSettings, runServiceAction } from "../system";
import { queryAuditLog } from "../system-audit";

export const handleGetSystemServices = withErrorHandling(() => jsonOk(getSystemServices()));

export const handlePostSystemServiceAction = withErrorHandling(
  async (request: Request, { params }: RouteContext) =>
    jsonOk(await runServiceAction((await params).id, request)),
);

export const handleGetSystemSettings = withErrorHandling(() => jsonOk(getSystemSettings()));

export const handlePatchSystemSettings = withErrorHandling(async (request: Request) =>
  jsonOk(await patchSystemSettings(request)),
);

export const handleGetSystemLogs = withErrorHandling((request: Request) =>
  jsonOk(getSystemLogs(readSearchParams(request))),
);

export const handleGetSystemMonitoring = withErrorHandling(() => jsonOk(getMonitoring()));

export const handleGetSystemUsageStats = withErrorHandling((request: Request) =>
  jsonOk(getUsageStats(readSearchParams(request))),
);

/** GET /admin/audit — журнал аудита с фильтрами и пагинацией (T4.2-05). */
export const handleGetAuditLog = withErrorHandling((request: Request) =>
  jsonOk(queryAuditLog(readSearchParams(request))),
);
