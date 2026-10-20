/** Тексты прохождения сценария и разбор ответа сервера на неверное действие. */
import { ApiError } from "@/shared/api";

export const WRONG_ACTION_MESSAGE = "Это действие не подходит к текущему шагу. Попробуйте другое.";
export const PENALTY_NOTE = "Неверная попытка записана и учитывается в итоговом балле.";

const STALE_MARKER = "Состояние прогона изменилось";

export type ActionFailure =
  | { kind: "wrong"; message: string }
  | { kind: "stale"; message: string }
  | { kind: "other"; message: string };

/**
 * 409 с текстом «Состояние прогона изменилось…» — устаревший шаг (штрафа нет); любой другой 409 — неверное
 * действие (попытка записана со штрафом). Остальные ошибки показываются текстом сервера.
 */
export function classifyActionError(error: unknown): ActionFailure {
  if (error instanceof ApiError && error.status === 409) {
    return error.message.startsWith(STALE_MARKER)
      ? { kind: "stale", message: error.message }
      : { kind: "wrong", message: WRONG_ACTION_MESSAGE };
  }
  return {
    kind: "other",
    message: error instanceof Error && error.message ? error.message : "Не удалось выполнить действие",
  };
}
