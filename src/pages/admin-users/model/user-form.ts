/*
 * Схема формы учётной записи (T4.1-07, spec/000-фронт/04-pages/20-admin-users.md «Создание учётной записи»).
 * Чистые функции без React: валидация и сборка тела запроса проверяются юнит-тестами.
 * Состав полей зависит от роли: обучающийся — группа, преподаватель — закреплённые группы
 * ([app-расширение], расхождение №5), № АРМ обязателен для всех ролей (вход в АРМ-112 с номером АРМ).
 */
import type { AdminUserCreateRequest, AdminUserUpdateRequest, PublicUser, Role } from "@/shared/api";

export type UserFormField = "fullName" | "login" | "password" | "armNumber" | "group" | "assignedGroups";

export type UserFormValues = {
  fullName: string;
  login: string;
  /** Временный пароль: задаётся только при создании. */
  password: string;
  role: Role;
  /** Строка из поля ввода: целое > 0. */
  armNumber: string;
  group: string;
  service: string;
  assignedGroups: string[];
};

export type UserFormErrors = Partial<Record<UserFormField, string>>;

export const EMPTY_USER_FORM: UserFormValues = {
  fullName: "",
  login: "",
  password: "",
  role: "student",
  armNumber: "",
  group: "",
  service: "",
  assignedGroups: [],
};

/** Логин АРМ-112: латиница без пробелов (совпадает с проверкой мок-слоя). */
const LOGIN_PATTERN = /^[a-z][a-z0-9._-]*$/i;

export const USER_FORM_MESSAGES = {
  fullName: "Укажите ФИО",
  login: "Укажите логин",
  loginFormat: "Логин — латиница без пробелов (допустимы цифры, «.», «_», «-»)",
  loginTaken: "Логин уже занят",
  password: "Задайте временный пароль",
  armNumber: "Номер АРМ — целое число больше нуля",
  group: "Выберите учебную группу",
  assignedGroups: "Отметьте хотя бы одну закреплённую группу",
} as const;

type ValidateOptions = {
  /** Создание требует временного пароля; редактирование — нет. */
  mode: "create" | "edit";
  /** Занятые логины в нижнем регистре (без логина редактируемого пользователя). */
  takenLogins?: readonly string[];
};

function isPositiveInteger(value: string): boolean {
  const parsed = Number(value.trim());
  return value.trim() !== "" && Number.isInteger(parsed) && parsed > 0;
}

/** Валидация формы; пустой объект — ошибок нет. Тексты — по-русски, для показа под полем. */
export function validateUserForm(values: UserFormValues, options: ValidateOptions): UserFormErrors {
  const errors: UserFormErrors = {};
  if (!values.fullName.trim()) errors.fullName = USER_FORM_MESSAGES.fullName;
  const login = values.login.trim();
  if (!login) errors.login = USER_FORM_MESSAGES.login;
  else if (!LOGIN_PATTERN.test(login)) errors.login = USER_FORM_MESSAGES.loginFormat;
  else if ((options.takenLogins ?? []).includes(login.toLowerCase())) {
    errors.login = USER_FORM_MESSAGES.loginTaken;
  }
  if (options.mode === "create" && !values.password.trim()) errors.password = USER_FORM_MESSAGES.password;
  if (!isPositiveInteger(values.armNumber)) errors.armNumber = USER_FORM_MESSAGES.armNumber;
  if (values.role === "student" && !values.group.trim()) errors.group = USER_FORM_MESSAGES.group;
  if (values.role === "teacher" && values.assignedGroups.length === 0) {
    errors.assignedGroups = USER_FORM_MESSAGES.assignedGroups;
  }
  return errors;
}

export function hasFormErrors(errors: UserFormErrors): boolean {
  return Object.keys(errors).length > 0;
}

/** Ролевые поля тела запроса: лишние для роли не отправляются. */
function roleFields(values: UserFormValues) {
  return {
    group: values.role === "student" ? values.group.trim() || undefined : undefined,
    service: values.role === "admin" ? undefined : values.service.trim() || undefined,
    assignedGroups: values.role === "teacher" ? values.assignedGroups : undefined,
  };
}

export function toCreateRequest(values: UserFormValues, adminId: string): AdminUserCreateRequest {
  return {
    adminId,
    fullName: values.fullName.trim(),
    login: values.login.trim(),
    password: values.password,
    role: values.role,
    armNumber: Number(values.armNumber.trim()),
    ...roleFields(values),
  };
}

/** Тело редактирования без поля role: смена роли — отдельное действие (T4.1-08). */
export function toUpdateRequest(values: UserFormValues, adminId: string): AdminUserUpdateRequest {
  return {
    adminId,
    fullName: values.fullName.trim(),
    login: values.login.trim(),
    armNumber: Number(values.armNumber.trim()),
    ...roleFields(values),
  };
}

export function toFormValues(user: PublicUser): UserFormValues {
  return {
    fullName: user.fullName,
    login: user.login,
    password: "",
    role: user.role,
    armNumber: String(user.armNumber),
    group: user.group ?? "",
    service: user.service ?? "",
    assignedGroups: user.assignedGroups ?? [],
  };
}
