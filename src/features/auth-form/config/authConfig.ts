import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

/** Редирект после входа по роли (spec/000-фронт/04-pages/00-auth.md «Поведение») — единственная карта. */
export const ROLE_HOME: Record<UserRole, string> = {
  student: ROUTES.studentHome,
  teacher: ROUTES.teacher,
  admin: ROUTES.adminUsers,
};

/** Клиентские сообщения формы (отказы входа — LOGIN_FAILURE_MESSAGES из shared/api). */
export const AUTH_MESSAGES = {
  credentialsRequired: "Введите логин и пароль",
} as const;
