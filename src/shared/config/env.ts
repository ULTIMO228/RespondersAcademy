/* Доступ к переменным окружения — только здесь (spec/000-фронт/10-code-rules.md §2; только NEXT_PUBLIC_*). */
const DEFAULT_MOCK_API_BASE_URL = "/api/mock";

export const APP_ENV = {
  /** Демо-режим: подсказки тестовых учёток на /login (NEXT_PUBLIC_DEMO_MODE=false — скрыть). */
  isDemoMode: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
  /** Базовый URL мок-слоя; замена бэкенда = смена этой переменной (контракты не меняются). */
  mockApiBaseUrl: process.env.NEXT_PUBLIC_MOCK_API_BASE_URL || DEFAULT_MOCK_API_BASE_URL,
} as const;

/**
 * Серверные переменные (в браузерную сборку не попадают — Next подставляет только NEXT_PUBLIC_*).
 * `BACKEND_URL` читает исключительно next.config.ts (AGENTS §6).
 */
export const SERVER_ENV = {
  /** Секрет подписи сессии мок-слоя (HS256). Не задан — процесс генерирует случайный при старте. */
  mockSessionSecret: process.env.MOCK_SESSION_SECRET,
} as const;
