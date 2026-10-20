/* Зависимости страницы «Модель ИИ» (спека 006): настройка, пробный запрос и состояние. В тестах подменяются целиком. */
import { getAiHealth, getAiSettings, putAiSettings, testAiConnection } from "@/shared/api";
import type {
  AiConnectionTestRequest,
  AiConnectionTestResult,
  AiHealth,
  AiSettings,
  AiSettingsUpdate,
} from "@/shared/api";

export type AccountAiApi = {
  settings: (signal?: AbortSignal) => Promise<AiSettings>;
  save: (body: AiSettingsUpdate) => Promise<AiSettings>;
  test: (body: AiConnectionTestRequest) => Promise<AiConnectionTestResult>;
  health: (signal?: AbortSignal) => Promise<AiHealth>;
};

export const accountAiApi: AccountAiApi = {
  settings: (signal) => getAiSettings(signal),
  save: (body) => putAiSettings(body),
  test: (body) => testAiConnection(body),
  health: (signal) => getAiHealth(signal),
};
