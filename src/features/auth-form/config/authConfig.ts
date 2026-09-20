import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";

/** Редирект после входа по роли (spec/04-pages/00-auth.md «Поведение») — единственная карта. */
export const ROLE_HOME: Record<UserRole, string> = {
  student: ROUTES.arm,
  teacher: ROUTES.teacher,
  admin: ROUTES.adminUsers,
};

/** 2FA-заглушка принимает любой 6-значный код (ТЗ §5 — многоуровневая аутентификация). */
export const OTP_LENGTH = 6;
export const OTP_PATTERN = new RegExp(`^\\d{${OTP_LENGTH}}$`);

/** Номер АРМ — целое число (сверяется сервером с User.armNumber). */
export const ARM_NUMBER_PATTERN = /^\d+$/;

/** Клиентские сообщения формы (отказы входа — LOGIN_FAILURE_MESSAGES из shared/api). */
export const AUTH_MESSAGES = {
  armRequired: "Укажите номер АРМ",
  invalidCode: `Введите ${OTP_LENGTH}-значный код из сообщения`,
} as const;
