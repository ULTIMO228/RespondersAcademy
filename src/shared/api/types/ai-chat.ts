/*
 * Чат разбора попытки (спека 010): POST /api/v1/ai/chat — contracts/api.md; клиентская реплика — data-model.md.
 * Ответ строит сервер (облако → локальная модель → шаблон); `source` честно показывает, кто ответил.
 */
import type { AiServedBy } from "./ai-settings";
import type { LobbyMode } from "./lobby";

/** Реплика истории, которую клиент присылает вместе с вопросом (не больше 6, роли только user/assistant). */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** Тело запроса: вопрос по своей попытке и последние реплики диалога. */
export interface ChatRequest {
  attemptId: string;
  mode: LobbyMode;
  message: string;
  history: ChatTurn[];
}

/** Ответ 200: `provider` и `modelName` — null для шаблонного ответа без модели. */
export interface ChatResponse {
  reply: string;
  source: AiServedBy;
  provider: string | null;
  modelName: string | null;
}

/** Реплика в ленте шторки (клиентская; в sessionStorage не попадает ничего лишнего). */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Только у ответов ассистента, из ChatResponse. */
  source?: AiServedBy;
  modelName?: string | null;
  /** failed — ответ не получен; в ленте показывается «Повторить». */
  status: "sent" | "failed";
  timestamp: string;
}
