/*
 * Route handlers /api/mock/admin/* (тонкие: логика — ../admin.ts; пользователи — ./admin-users.ts,
 * раздел «Система» и журнал аудита — ./system.ts).
 */
import { getSettings, listServices } from "../admin";
import { jsonOk, withErrorHandling } from "../respond";

export const handleGetAdminServices = withErrorHandling(() => jsonOk(listServices()));

export const handleGetAdminSettings = withErrorHandling(() => jsonOk(getSettings()));
