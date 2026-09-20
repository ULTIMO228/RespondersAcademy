import { ApiError } from "@/shared/api";

import type { LoadStatus } from "./types";

const NETWORK_ERROR_STATUS = 0;
const FALLBACK_MESSAGE = "Не удалось загрузить данные";

/** Ошибка запроса → состояние загрузки: status 0 (сеть) — offline, остальное — error. */
export function toFailureStatus(error: unknown): LoadStatus {
  return error instanceof ApiError && error.status === NETWORK_ERROR_STATUS ? "offline" : "error";
}

/** Ru-сообщение ошибки для UI (сообщения мок-слоя уже на русском). */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE;
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
