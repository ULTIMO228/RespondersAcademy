import { apiClient } from "../client";
import type { AttemptProgressRequest, CardAttemptRequest, CardAttemptResponse, CardEvent } from "../types";
import { API_PATHS } from "./paths";

/** POST /cards/[id]/attempt — открыть попытку курсанта (создать или продолжить; повтор идемпотентен). */
export function postCardAttempt(cardId: string, body: CardAttemptRequest): Promise<CardAttemptResponse> {
  return apiClient.post<CardAttemptResponse>(API_PATHS.cardAttempt(cardId), body);
}

/** POST /attempts/[id]/progress — статус / введённый текст / завершение попытки. */
export function postAttemptProgress(attemptId: string, body: AttemptProgressRequest): Promise<CardEvent> {
  return apiClient.post<CardEvent>(API_PATHS.attemptProgress(attemptId), body);
}
