import { ApiError } from "@/shared/api";

/** Состояние загрузки данных софтфона: loading / ready / error (offline — сеть, status 0). */
export type LoadState<TData> =
  | { status: "loading" }
  | { status: "ready"; data: TData }
  | { status: "error"; message: string; isOffline: boolean };

const NETWORK_STATUS = 0;
const FALLBACK_ERROR = "Не удалось загрузить данные. Повторите попытку";

export function toErrorState(error: unknown): { status: "error"; message: string; isOffline: boolean } {
  if (error instanceof ApiError) {
    return { status: "error", message: error.message, isOffline: error.status === NETWORK_STATUS };
  }
  return { status: "error", message: FALLBACK_ERROR, isOffline: false };
}
