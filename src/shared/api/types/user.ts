/*
 * Пользователи и роли — spec/000-фронт/05-data-models.md §1 (mocks/users.json).
 */

export type Role = "student" | "teacher" | "admin";

export interface User {
  /** "u-001" … "u-024" */
  id: string;
  /** Латиница, без пробелов. */
  login: string;
  /** [мок-расширение] тестовый пароль, только локальный контур. Наружу из мок-слоя не отдаётся (см. PublicUser). */
  password: string;
  fullName: string;
  role: Role;
  /** Номер рабочего места («Опер., АРМ 4»), сверяется при входе. */
  armNumber: number;
  /** false — учётная запись заблокирована (вход запрещён). */
  isActive: boolean;
  /** [расширение] учебная группа (роль «Обучающийся»). */
  group?: string;
  /** [расширение] служба/организация. */
  service?: string;
  /**
   * [app-расширение вне 05-data-models.md §1] закреплённые за преподавателем группы
   * (20-admin-users.md «Создание учётной записи»; зафиксированное расхождение №5 — вынести владельцу спек).
   */
  assignedGroups?: string[];
}

/** Пользователь без пароля — единственная форма, в которой User покидает мок-слой (PII-гигиена). */
export type PublicUser = Omit<User, "password">;

/** [расширение мок-слоя] ответ POST /api/mock/auth/login (04-pages/00-auth.md). */
export interface AuthSession {
  userId: string;
  role: Role;
  /** Мок-токен. */
  token: string;
  twoFactorUsed: boolean;
  /** ISO 8601 с московским смещением. */
  issuedAt: string;
}

/**
 * [расширение мок-слоя] Политика входа для `/login` (GET /api/mock/auth/policy): публичная
 * проекция блока `SystemSettings.security` (T4.2-17). Администратор выключает 2FA в настройках —
 * форма входа перестаёт запрашивать код (04-pages/00-auth.md, 02-roles.md).
 */
export interface AuthPolicy {
  twoFactorRequired: boolean;
  minPasswordLength: number;
  lockAfterAttempts: number;
}
