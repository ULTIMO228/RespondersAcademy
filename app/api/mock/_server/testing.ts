/*
 * Доступ к серверному мок-слою для тестов слайсов (RTL/интеграционные).
 * `@/shared/api/mock` — серверный сегмент: импортировать его из `src/**` нельзя (Steiger,
 * fsd/no-public-api-sidestep), поэтому тесты берут ридеры и сброс store отсюда — как route handlers.
 * Приватная папка Next `_server` роутом не становится; в бандл приложения этот модуль не попадает.
 */
export { readGroupReport, readReports } from "@/shared/api/mock";
export { listAuditLog } from "@/shared/api/mock";
export { resetMockStore } from "@/shared/api/mock";
export { buildSessionCookie, buildSessionToken, ensureTestStudent } from "@/shared/api/mock";
