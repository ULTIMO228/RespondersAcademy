/*
 * Клиент реестра пользователей администратора (T4.1-04, `/admin/users`).
 * Компоненты страницы не знают про fetch и URL — только эти функции (spec/000-фронт/10-code-rules.md §3).
 * Ошибки мок-слоя переводятся в доменный результат формой `AdminUserFailure` (409 → «логин занят»).
 */
import { ApiError, apiClient } from "../client";
import type {
  AdminUserCreateRequest,
  AdminUserListQuery,
  AdminUserPasswordResetResponse,
  AdminUserUpdateRequest,
  PublicUser,
  Role,
} from "../types";
import { API_PATHS } from "./paths";

/** Причина отказа мутации реестра — для показа в форме/диалоге. */
export type AdminUserFailureReason = "loginTaken" | "validation" | "forbidden" | "notFound" | "unknown";

export interface AdminUserFailure {
  reason: AdminUserFailureReason;
  /** Поле формы, к которому относится ошибка (для `loginTaken` — «login»). */
  field?: "login";
  message: string;
}

export const ADMIN_USER_FAILURE_MESSAGES = {
  loginTaken: "Логин уже занят",
  forbidden: "Действие доступно только администратору",
  notFound: "Учётная запись не найдена",
  unknown: "Не удалось выполнить действие. Повторите попытку",
} as const;

const HTTP_BAD_REQUEST = 400;
/** 422 мок-слой не использует (ошибки полей — 400 validationFailed), но маппер его учитывает. */
const HTTP_UNPROCESSABLE = 422;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;

/** GET /admin/users — реестр с фильтрами роль/состояние/группа и поиском по ФИО/логину. */
export function adminListUsers(query?: AdminUserListQuery, signal?: AbortSignal): Promise<PublicUser[]> {
  return apiClient.get<PublicUser[]>(API_PATHS.adminUsers, query, signal);
}

/** POST /admin/users — создание учётной записи (409 при занятом логине). */
export function adminCreateUser(body: AdminUserCreateRequest): Promise<PublicUser> {
  return apiClient.post<PublicUser>(API_PATHS.adminUsers, body);
}

/** PATCH /admin/users/[id] — редактирование полей учётной записи (без смены роли). */
export function adminUpdateUser(userId: string, body: AdminUserUpdateRequest): Promise<PublicUser> {
  return apiClient.patch<PublicUser>(API_PATHS.adminUser(userId), body);
}

/** PATCH /admin/users/[id] с полем role — отдельное действие «назначить/сменить роль» (событие аудита). */
export function adminSetUserRole(
  userId: string,
  role: Role,
  adminId: string,
  roleFields: Omit<AdminUserUpdateRequest, "adminId" | "role"> = {},
): Promise<PublicUser> {
  return apiClient.patch<PublicUser>(API_PATHS.adminUser(userId), { ...roleFields, adminId, role });
}

/** POST /admin/users/[id]/block | /unblock — переключение `User.isActive` (02-roles.md). */
export function adminSetUserActive(userId: string, isActive: boolean, adminId: string): Promise<PublicUser> {
  const path = isActive ? API_PATHS.adminUserUnblock(userId) : API_PATHS.adminUserBlock(userId);
  return apiClient.post<PublicUser>(path, { adminId });
}

/** POST /admin/users/[id]/reset-password — временный пароль показывается администратору один раз. */
export function adminResetUserPassword(
  userId: string,
  adminId: string,
): Promise<AdminUserPasswordResetResponse> {
  return apiClient.post<AdminUserPasswordResetResponse>(API_PATHS.adminUserResetPassword(userId), {
    adminId,
  });
}

/** Ошибка клиента → причина + ru-сообщение (409 «логин занят» подсвечивает поле формы). */
export function mapAdminUserError(error: unknown): AdminUserFailure {
  if (!(error instanceof ApiError)) {
    return { reason: "unknown", message: ADMIN_USER_FAILURE_MESSAGES.unknown };
  }
  switch (error.status) {
    case HTTP_CONFLICT:
      return { reason: "loginTaken", field: "login", message: ADMIN_USER_FAILURE_MESSAGES.loginTaken };
    case HTTP_BAD_REQUEST:
    case HTTP_UNPROCESSABLE:
      return { reason: "validation", message: error.message };
    case HTTP_FORBIDDEN:
      return { reason: "forbidden", message: ADMIN_USER_FAILURE_MESSAGES.forbidden };
    case HTTP_NOT_FOUND:
      return { reason: "notFound", message: ADMIN_USER_FAILURE_MESSAGES.notFound };
    default:
      return { reason: "unknown", message: ADMIN_USER_FAILURE_MESSAGES.unknown };
  }
}
