/* Зависимость баннера: запрос состояния ИИ (в тестах подменяется целиком). */
import { getAiHealth } from "@/shared/api";
import type { AiHealth } from "@/shared/api";

export type AiHealthApi = {
  health: (signal?: AbortSignal) => Promise<AiHealth>;
};

export const aiHealthApi: AiHealthApi = { health: (signal) => getAiHealth(signal) };
