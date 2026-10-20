/* Источник ИИ и его состояние — контракт спеки 006 (contracts/ai-endpoints.md). Ключ в ответах отсутствует всегда. */

/** Откуда берутся тексты ИИ: локальная модель или облако (Polza.ai). */
export type AiSourceKind = "local" | "cloud";

/** Чем фактически ответили на последний вызов; `template` — шаблон без модели. */
export type AiServedBy = "cloud" | "local" | "template";

/** Причина неудачи обращения к источнику (enum ai_health.last_error_reason). */
export type AiErrorReason =
  | "invalid_key"
  | "insufficient_funds"
  | "rate_limited"
  | "daily_limit"
  | "timeout"
  | "network"
  | "wrong_route"
  | "bad_response"
  | "local_down";

export interface AiCloudSettings {
  model: string;
  /** Маршрут провайдера, например «cerebras/fp16». */
  route: string;
  keyConfigured: boolean;
  /** Последние 4 символа ключа для показа «…abcd»; сам ключ не отдаётся. */
  keyLast4: string | null;
  /** false — облачная модель ещё не подтверждена, выбрать её нельзя. */
  available: boolean;
}

/** GET/PUT /admin/ai/settings. */
export interface AiSettings {
  source: AiSourceKind;
  cloud: AiCloudSettings;
  /** Настройка задана окружением, а не сохранена администратором. */
  fromEnv: boolean;
  /** Функции, которые уходят в облако (генерация сценариев, пояснение карты ошибок). */
  cloudFunctions: string[];
  updatedAt: string | null;
  updatedBy: string | null;
}

/** PUT /admin/ai/settings. `apiKey` обрезается сервером; `clearKey` при cloud переключает на local. */
export interface AiSettingsUpdate {
  source: AiSourceKind;
  apiKey?: string;
  clearKey?: boolean;
}

/** POST /admin/ai/settings/test: без `apiKey` проверяется сохранённый ключ. Ничего не сохраняет. */
export interface AiConnectionTestRequest {
  source: AiSourceKind;
  apiKey?: string;
}

export interface AiConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  route: string | null;
  reason?: AiErrorReason;
}

export type AiHealthState = "ok" | "degraded" | "down";

/** GET /ai/health: преподавателю — без полей после `lastErrorAt`, администратору — с деталями. */
export interface AiHealth {
  state: AiHealthState;
  activeSource: AiSourceKind;
  servedBy: AiServedBy;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  reason?: AiErrorReason | null;
  errorsToday?: number;
  callsToday?: number;
  dailyLimit?: number | null;
}
