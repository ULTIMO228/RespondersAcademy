/*
 * Клиент данных `/admin/users` (T4.1-04…T4.1-09): реестр и мутации — только через `@/shared/api`.
 * Зависимости вынесены в тип, чтобы экран тестировался без сети (RTL вместо e2e: Playwright не установлен).
 */
import {
  adminCreateUser,
  adminListUsers,
  adminResetUserPassword,
  adminSetUserActive,
  adminSetUserRole,
  adminUpdateUser,
} from "@/shared/api";
import type {
  AdminUserCreateRequest,
  AdminUserListQuery,
  AdminUserPasswordResetResponse,
  AdminUserRoleFields,
  AdminUserUpdateRequest,
  PublicUser,
  Role,
} from "@/shared/api";

export type AdminUsersApi = {
  listUsers: (query?: AdminUserListQuery, signal?: AbortSignal) => Promise<PublicUser[]>;
  createUser: (body: AdminUserCreateRequest) => Promise<PublicUser>;
  updateUser: (userId: string, body: AdminUserUpdateRequest) => Promise<PublicUser>;
  setUserRole: (
    userId: string,
    role: Role,
    adminId: string,
    roleFields?: AdminUserRoleFields,
  ) => Promise<PublicUser>;
  setUserActive: (userId: string, isActive: boolean, adminId: string) => Promise<PublicUser>;
  resetPassword: (userId: string, adminId: string) => Promise<AdminUserPasswordResetResponse>;
};

export const defaultAdminUsersApi: AdminUsersApi = {
  listUsers: adminListUsers,
  createUser: adminCreateUser,
  updateUser: adminUpdateUser,
  setUserRole: adminSetUserRole,
  setUserActive: adminSetUserActive,
  resetPassword: adminResetUserPassword,
};

export type AdminUsersPageData = {
  /** Строки реестра по текущим фильтрам. */
  users: PublicUser[];
  /** Полный реестр: знаменатель счётчика, список групп и проверка занятых логинов. */
  allUsers: PublicUser[];
};

/** Загрузка страницы: отфильтрованный список + полный реестр (для справочников формы). */
export async function loadAdminUsersPage(
  api: AdminUsersApi,
  query: AdminUserListQuery,
  signal?: AbortSignal,
): Promise<AdminUsersPageData> {
  const [users, allUsers] = await Promise.all([
    api.listUsers(query, signal),
    api.listUsers(undefined, signal),
  ]);
  return { users, allUsers };
}
