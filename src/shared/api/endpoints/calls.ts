import type { AiResponse } from "../ai-gateway";
import { apiClient } from "../client";
import type { CallReply, CallReplyRequest, CardCallRequest, CardCallResponse } from "../types";
import { API_PATHS } from "./paths";

/** POST /calls/reply — реплика ИИ-абонента точки C (мок; ответ с маркером ИИ). 404 — абонент не найден. */
export function postCallReply(body: CallReplyRequest, signal?: AbortSignal): Promise<AiResponse<CallReply>> {
  return apiClient.post<AiResponse<CallReply>>(API_PATHS.callReply, body, signal);
}

/** POST /cards/[id]/calls — завершённый вызов в CardEvent.calls попытки; 404 — попытка не открыта. */
export function postCardCall(cardId: string, body: CardCallRequest): Promise<CardCallResponse> {
  return apiClient.post<CardCallResponse>(API_PATHS.cardCalls(cardId), body);
}
