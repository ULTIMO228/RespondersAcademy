/*
 * Клиент настройки источника ИИ и состояния (спека 006): /api/v1/admin/ai/settings[/test], /api/v1/ai/health.
 * Только с бэкендом: без BACKEND_URL клиент отдаёт ServerRequiredError («требуется сервер»).
 */
import type {
  AiConnectionTestRequest,
  AiErrorReason,
  AiConnectionTestResult,
  AiHealth,
  AiSettings,
  AiSettingsUpdate,
} from "./types";
import { v1ApiClient } from "./v1-client";

/** GET /admin/ai/settings (admin). */
export function getAiSettings(signal?: AbortSignal): Promise<AiSettings> {
  return v1ApiClient.get<AiSettings>("/admin/ai/settings", undefined, signal);
}

/** PUT /admin/ai/settings (admin): источник и/или ключ. */
export function putAiSettings(body: AiSettingsUpdate, signal?: AbortSignal): Promise<AiSettings> {
  return v1ApiClient.put<AiSettings>("/admin/ai/settings", body, signal);
}

/** POST /admin/ai/settings/test (admin): пробный запрос, ничего не сохраняет. */
export function testAiConnection(
  body: AiConnectionTestRequest,
  signal?: AbortSignal,
): Promise<AiConnectionTestResult> {
  return v1ApiClient.post<AiConnectionTestResult>("/admin/ai/settings/test", body, signal);
}

/** GET /ai/health (admin, teacher): состояние ИИ; преподавателю — без деталей. */
export function getAiHealth(signal?: AbortSignal): Promise<AiHealth> {
  return v1ApiClient.get<AiHealth>("/ai/health", undefined, signal);
}

/** Причины сбоя обращения к источнику ИИ по-русски (для проверки подключения, состояния и баннера администратора). */
export const AI_ERROR_REASON_MESSAGES: Record<AiErrorReason, string> = {
  invalid_key: "Ключ не принят провайдером",
  insufficient_funds: "Недостаточно средств на счёте провайдера",
  rate_limited: "Превышен лимит запросов в минуту",
  daily_limit: "Исчерпан суточный лимит запросов",
  timeout: "Провайдер не ответил вовремя",
  network: "Нет сетевого соединения с провайдером",
  wrong_route: "Провайдер не подтвердил маршрут cerebras/fp16",
  bad_response: "Провайдер вернул непонятный ответ",
  local_down: "Локальная модель недоступна",
};
