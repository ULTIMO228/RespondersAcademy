/* Состояние бэкенда — /api/v1/health. Без бэкенда Next отвечает 404: клиент превращает его в ServerRequiredError. */
import { v1ApiClient } from "../v1-client";
import type { HealthStatus } from "../types";

export function getHealth(signal?: AbortSignal): Promise<HealthStatus> {
  return v1ApiClient.get<HealthStatus>("/health", undefined, signal);
}
