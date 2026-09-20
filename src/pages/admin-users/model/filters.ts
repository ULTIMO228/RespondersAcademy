/*
 * Фильтры реестра пользователей (T4.1-06): состояние панели ⇄ query мок-API ⇄ query адресной строки
 * (ссылка на отфильтрованный реестр шарится). Значение "" — «все».
 */
import type { AdminUserListQuery, AdminUserState, Role } from "@/shared/api";

import { ALL_VALUE } from "../config/usersTable";

export type UsersFilters = {
  role: string;
  state: string;
  group: string;
  /** Поиск по ФИО и логину (в запрос уходит с дебаунсом). */
  query: string;
};

export const EMPTY_FILTERS: UsersFilters = {
  role: ALL_VALUE,
  state: ALL_VALUE,
  group: ALL_VALUE,
  query: "",
};

/** Ключи query-строки — те же, что у `GET /api/mock/admin/users`. */
export const FILTER_PARAM = { role: "role", state: "state", group: "group", query: "q" } as const;

/** Фильтры → query мок-API (пустые значения опускает клиент `buildQuery`). */
export function toListQuery(filters: UsersFilters): AdminUserListQuery {
  return {
    role: (filters.role || undefined) as Role | undefined,
    state: (filters.state || undefined) as AdminUserState | undefined,
    group: filters.group || undefined,
    q: filters.query.trim() || undefined,
  };
}

/** Фильтры → строка адресной строки ("" — фильтров нет). */
export function toSearchString(filters: UsersFilters): string {
  const params = new URLSearchParams();
  if (filters.role) params.set(FILTER_PARAM.role, filters.role);
  if (filters.state) params.set(FILTER_PARAM.state, filters.state);
  if (filters.group) params.set(FILTER_PARAM.group, filters.group);
  if (filters.query.trim()) params.set(FILTER_PARAM.query, filters.query.trim());
  return params.toString();
}

/** Начальные фильтры из адресной строки (шаринг ссылки). */
export function fromSearchParams(params: URLSearchParams | null): UsersFilters {
  if (!params) return EMPTY_FILTERS;
  return {
    role: params.get(FILTER_PARAM.role) ?? ALL_VALUE,
    state: params.get(FILTER_PARAM.state) ?? ALL_VALUE,
    group: params.get(FILTER_PARAM.group) ?? ALL_VALUE,
    query: params.get(FILTER_PARAM.query) ?? "",
  };
}
