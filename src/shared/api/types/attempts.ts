/*
 * Попытка курсанта по карточке (CardEvent, spec/05-data-models.md §7) — открытие и ход отработки (T2.3-01).
 * Незавершённая попытка: completedAt = "" и fullProcessingMs = 0 (до «Работы завершены» / «Отказ…»).
 */
import type { CardEvent, CardStatusMark } from "./session";

/** POST /api/mock/cards/[id]/attempt — открыть (создать или продолжить) попытку курсанта. */
export interface CardAttemptRequest {
  studentId: string;
  /** Время выдачи карточки (CardFlowItem.issuedAt), если известно клиенту ленты. */
  issuedAt?: string;
}

export interface CardAttemptResponse {
  sessionId: string;
  attempt: CardEvent;
  /** false — попытка уже была открыта (повторное открытие идемпотентно). */
  created: boolean;
}

/** POST /api/mock/attempts/[id]/progress — ход отработки: статус, введённый текст, завершение. */
export interface AttemptProgressRequest {
  status?: CardStatusMark;
  enteredText?: Record<string, string>;
  /** Завершение попытки (ISO): fullProcessingMs = completedAt − openedAt. */
  completedAt?: string;
}
