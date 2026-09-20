import { apiClient } from "../client";
import type { PublicUser, UserListQuery } from "../types";
import { API_PATHS } from "./paths";

/**
 * GET /users?role=&group= — состав учебных групп для мастера занятия и мониторинга (без password).
 * Обучающемуся эндпоинт недоступен (403).
 */
export function listUsers(query?: UserListQuery, signal?: AbortSignal): Promise<PublicUser[]> {
  return apiClient.get<PublicUser[]>(API_PATHS.users, query, signal);
}
