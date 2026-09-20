"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { mapAdminUserError } from "@/shared/api";
import type { AdminUserFailure, AdminUserRoleFields, PublicUser, Role } from "@/shared/api";

import { defaultAdminUsersApi, loadAdminUsersPage } from "../api/adminUsersApi";
import type { AdminUsersApi, AdminUsersPageData } from "../api/adminUsersApi";
import { fromSearchParams, toListQuery, toSearchString } from "./filters";
import type { UsersFilters } from "./filters";
import { toCreateRequest, toUpdateRequest } from "./user-form";
import type { UserFormValues } from "./user-form";

/** Пауза перед запросом поиска по ФИО/логину (T4.1-06). */
export const SEARCH_DEBOUNCE_MS = 250;

export type AdminUsersState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: AdminUsersPageData };

type UseAdminUsersOptions = {
  /** Администратор сессии — автор всех мутаций (пишется в журнал аудита). */
  adminId: string;
  /** Подмена клиента данных (тесты). */
  api?: AdminUsersApi;
};

const LOAD_ERROR = "Не удалось загрузить реестр пользователей";

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : LOAD_ERROR;
}

/**
 * Состояние `/admin/users`: фильтры (синхронизированы с query адресной строки), загрузка реестра
 * через мок-слой и мутации с перезагрузкой списка. Ошибки мутаций возвращаются вызывающему
 * в доменной форме `AdminUserFailure` (409 → «логин занят» у поля формы).
 */
export function useAdminUsers({ adminId, api = defaultAdminUsersApi }: UseAdminUsersOptions) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<UsersFilters>(() => fromSearchParams(searchParams));
  const [appliedQuery, setAppliedQuery] = useState(() => filters.query);
  const [state, setState] = useState<AdminUsersState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  /* Поиск уходит в запрос с паузой: набор текста не создаёт запрос на каждый символ. */
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(filters.query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters.query]);

  /* Зависимости — значения фильтров, а не объект: набор текста не должен перезапускать запрос до паузы. */
  const { role, state: stateFilter, group } = filters;
  const query = useMemo(
    () => toListQuery({ role, state: stateFilter, group, query: appliedQuery }),
    [appliedQuery, group, role, stateFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;
    setState((current) => (current.status === "ready" ? current : { status: "loading" }));
    loadAdminUsersPage(api, query, controller.signal)
      .then((data) => {
        if (isActive) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (isActive && !controller.signal.aborted) setState({ status: "error", message: toMessage(error) });
      });
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [api, query, reloadToken]);

  /* Фильтры — в адресной строке: ссылку на отфильтрованный реестр можно переслать. */
  useEffect(() => {
    const search = toSearchString({ role, state: stateFilter, group, query: appliedQuery });
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [appliedQuery, group, pathname, role, router, stateFilter]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<AdminUserFailure | null> => {
      try {
        await action();
        reload();
        return null;
      } catch (error) {
        return mapAdminUserError(error);
      }
    },
    [reload],
  );

  const createUser = useCallback(
    (values: UserFormValues) => run(() => api.createUser(toCreateRequest(values, adminId))),
    [adminId, api, run],
  );

  const updateUser = useCallback(
    (userId: string, values: UserFormValues) =>
      run(() => api.updateUser(userId, toUpdateRequest(values, adminId))),
    [adminId, api, run],
  );

  const changeRole = useCallback(
    (userId: string, role: Role, roleFields?: AdminUserRoleFields) =>
      run(() => api.setUserRole(userId, role, adminId, roleFields)),
    [adminId, api, run],
  );

  const setUserActive = useCallback(
    (userId: string, isActive: boolean) => run(() => api.setUserActive(userId, isActive, adminId)),
    [adminId, api, run],
  );

  /** Возвращает временный пароль для показа администратору либо доменную ошибку. */
  const resetPassword = useCallback(
    async (userId: string): Promise<{ temporaryPassword: string } | AdminUserFailure> => {
      try {
        const result = await api.resetPassword(userId, adminId);
        reload();
        return { temporaryPassword: result.temporaryPassword };
      } catch (error) {
        return mapAdminUserError(error);
      }
    },
    [adminId, api, reload],
  );

  return {
    filters,
    setFilters,
    state,
    createUser,
    updateUser,
    changeRole,
    setUserActive,
    resetPassword,
  };
}

/** Список учебных групп реестра (значения фильтра и формы) — из полного списка пользователей. */
export function collectGroups(users: readonly PublicUser[]): string[] {
  const groups = new Set<string>();
  for (const user of users) {
    if (user.group) groups.add(user.group);
    for (const assigned of user.assignedGroups ?? []) groups.add(assigned);
  }
  return [...groups].sort((left, right) => left.localeCompare(right, "ru"));
}
