import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

/** Редирект после входа по роли (spec/000-фронт/04-pages/00-auth.md «Поведение») — единственная карта. */
export const ROLE_HOME: Record<UserRole, string> = {
  student: ROUTES.arm,
  teacher: ROUTES.teacher,
  admin: ROUTES.adminUsers,
};

/** Номер АРМ — целое число (сверяется сервером с User.armNumber). */
export const ARM_NUMBER_PATTERN = /^\d+$/;

/** Клиентские сообщения формы (отказы входа — LOGIN_FAILURE_MESSAGES из shared/api). */
export const AUTH_MESSAGES = {
  armRequired: "Укажите номер АРМ",
} as const;
