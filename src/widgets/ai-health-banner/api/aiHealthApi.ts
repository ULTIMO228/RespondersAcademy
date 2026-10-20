/* Зависимость баннера: запрос состояния ИИ (в тестах подменяется целиком). */
import { getAiHealth, getAiSettings } from "@/shared/api";
import type { AiHealth, AiSettings } from "@/shared/api";

export type AiHealthApi = {
  health: (signal?: AbortSignal) => Promise<AiHealth>;
  /** Настройки ИИ (только администратору): нужны, чтобы подсказать «ключ не задан». */
  settings?: (signal?: AbortSignal) => Promise<AiSettings>;
};

export const aiHealthApi: AiHealthApi = {
  health: (signal) => getAiHealth(signal),
  settings: (signal) => getAiSettings(signal),
};
