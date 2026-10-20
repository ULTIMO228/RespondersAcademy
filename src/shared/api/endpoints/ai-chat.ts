/*
 * Чат разбора попытки (спека 020): POST /api/v1/ai/chat. Ответ строит сервер (облако → локальная модель → шаблон),
 * поле `source` показывает, кто ответил. Клиент — aiApiClient, как у прочих /api/v1/ai/* (ошибки — ApiError).
 */
import { aiApiClient } from "../ai-client";
import type { ChatRequest, ChatResponse } from "../types";

/** POST /api/v1/ai/chat: вопрос по своей попытке; history — не больше 6 последних реплик. */
export function postAttemptChat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResponse> {
  return aiApiClient.post<ChatResponse>("/chat", request, signal);
}
