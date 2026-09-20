/*
 * Реестр пользователей администратора (T4.1-02, T4.1-03; spec/04-pages/20-admin-users.md, ТЗ §8):
 *   GET    /admin/users                     — список с фильтрами role|state|group и поиском q;
 *   POST   /admin/users                     — создание (id "u-NNN", уникальный логин → 409);
 *   PATCH  /admin/users/[id]                — редактирование; поле role — отдельное событие «смена роли»;
 *   POST   /admin/users/[id]/block|unblock  — переключение User.isActive (02-roles.md);
 *   POST   /admin/users/[id]/reset-password — временный пароль (показывается администратору один раз).
 *
 * Каждая мутация пишет AuditLogEntry (критерий приёмки 20-admin-users.md). Наружу пользователь уходит
 * только через toPublicUser — без поля password (минимальные привилегии, PII-гигиена).
 */
import type {
  AdminUserCreateRequest,
  AdminUserPasswordResetResponse,
  AdminUserRoleFields,
  AdminUserState,
  AdminUserUpdateRequest,
  PublicUser,
  Role,
  User,
} from "../types";
import { readJsonBody, readStringParam } from "./request";
import { conflict, forbidden, notFound, validationFailed } from "./respond";
import {
  appendAuditEntry,
  findStoredUser,
  findStoredUserByLogin,
  insertStoredUser,
  listStoredUsers,
  toPublicUser,
  updateStoredUser,
} from "./store-admin";

/** Действия журнала аудита, которые пишет реестр пользователей (см. mocks/admin/audit-log.json). */
export const AUDIT_ACTION = {
  userCreated: "user.create",
  userUpdated: "user.update",
  userRoleChanged: "user.roleChange",
  userBlocked: "user.block",
  userUnblocked: "user.unblock",
  userPasswordReset: "user.passwordReset",
} as const;

export const ADMIN_ONLY_MESSAGE = "Действие доступно только администратору";
export const LOGIN_TAKEN_MESSAGE = "Логин уже занят";
export const SELF_BLOCK_MESSAGE = "Нельзя заблокировать собственную учётную запись";

const ROLES: readonly Role[] = ["student", "teacher", "admin"];
const STATES: readonly AdminUserState[] = ["active", "blocked"];
export const ROLE_TITLE: Record<Role, string> = {
  student: "Обучающийся",
  teacher: "Преподаватель",
  admin: "Администратор",
};

/** Логин АРМ-112: латиница, цифры, «.», «_», «-»; начинается с буквы, без пробелов. */
const LOGIN_PATTERN = /^[a-z][a-z0-9._-]*$/i;
const TEMP_PASSWORD_PREFIX = "arm112-";
const TEMP_PASSWORD_MIN = 1000;
const TEMP_PASSWORD_RANGE = 9000;

/* ── Разбор и валидация ── */

function requireAdmin(body: Record<string, unknown>): User {
  const { adminId } = body;
  if (typeof adminId !== "string" || !adminId.trim()) throw validationFailed("Укажите «adminId»");
  const admin = findStoredUser(adminId.trim());
  if (admin?.role !== "admin") throw forbidden(ADMIN_ONLY_MESSAGE);
  return admin;
}

function requireUser(userId: string): User {
  const user = findStoredUser(userId);
  if (!user) throw notFound(`Пользователь «${userId}» не найден`);
  return user;
}

function readFullName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw validationFailed("Укажите ФИО");
  return value.trim();
}

function readLogin(value: unknown, ownerId?: string): string {
  if (typeof value !== "string" || !value.trim()) throw validationFailed("Укажите логин");
  const login = value.trim();
  if (!LOGIN_PATTERN.test(login)) {
    throw validationFailed("Логин — латиница без пробелов (допустимы цифры, «.», «_», «-»)");
  }
  const taken = findStoredUserByLogin(login);
  if (taken && taken.id !== ownerId) throw conflict(LOGIN_TAKEN_MESSAGE);
  return login;
}

function readPassword(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw validationFailed("Укажите временный пароль");
  return value;
}

function readArmNumber(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed <= 0) {
    throw validationFailed("Номер АРМ — целое число больше нуля");
  }
  return parsed;
}

function readRole(value: unknown): Role {
  if (typeof value !== "string" || !(ROLES as readonly string[]).includes(value)) {
    throw validationFailed(`Некорректная роль: ${String(value)}`);
  }
  return value as Role;
}

function readOptionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw validationFailed(`Некорректное значение поля «${field}»`);
  return value.trim() || undefined;
}

function readGroupList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw validationFailed("«Закреплённые группы» — список названий групп");
  }
  const groups = (value as string[]).map((entry) => entry.trim()).filter(Boolean);
  return groups.length > 0 ? groups : undefined;
}

/**
 * Ролевые поля по правилам роли (T4.1-08): обучающийся — группа и служба; преподаватель — закреплённые
 * группы; администратор — без учебных привязок. Лишние поля отбрасываются, а не «переезжают» с ролью.
 * Семантика PATCH: не переданное поле сохраняет прежнее значение (JSON не отличает «не передано» от null).
 */
function applyRoleFields(draft: Omit<User, "id">, role: Role, fields: AdminUserRoleFields): void {
  const group = readOptionalText(fields.group, "группа");
  const service = readOptionalText(fields.service, "служба");
  const assignedGroups = readGroupList(fields.assignedGroups);
  draft.role = role;
  draft.group = role === "student" ? (group ?? draft.group) : undefined;
  draft.service = role === "admin" ? undefined : (service ?? draft.service);
  draft.assignedGroups = role === "teacher" ? (assignedGroups ?? draft.assignedGroups) : undefined;
}

/* ── Список ── */

function matchesState(user: User, state: AdminUserState | undefined): boolean {
  if (state === undefined) return true;
  return state === "active" ? user.isActive : !user.isActive;
}

/** Поиск по ФИО и логину, регистронезависимо. */
function matchesQuery(user: User, query: string | undefined): boolean {
  if (!query) return true;
  return `${user.fullName} ${user.login}`.toLowerCase().includes(query.toLowerCase());
}

/** GET /admin/users: фильтры роль/состояние/группа + поиск `q`; мусор в фильтрах → 400. */
export function listAdminUsers(params: URLSearchParams): PublicUser[] {
  const roleParam = readStringParam(params, "role");
  const role = roleParam === undefined ? undefined : readRole(roleParam);
  const stateParam = readStringParam(params, "state");
  if (stateParam !== undefined && !(STATES as readonly string[]).includes(stateParam)) {
    throw validationFailed(`Некорректное состояние: ${stateParam}`);
  }
  const state = stateParam as AdminUserState | undefined;
  const group = readStringParam(params, "group");
  const query = readStringParam(params, "q");
  return listStoredUsers()
    .filter(
      (user) =>
        (!role || user.role === role) &&
        (!group || user.group === group) &&
        matchesState(user, state) &&
        matchesQuery(user, query),
    )
    .map(toPublicUser);
}

/* ── Мутации ── */

function audit(adminId: string, action: string, details: string): void {
  appendAuditEntry({ userId: adminId, role: "admin", action, details });
}

function describe(user: User): string {
  return `${user.login} (${user.id})`;
}

/** POST /admin/users — создание учётной записи; дубликат логина → 409. */
export async function createAdminUser(httpRequest: Request): Promise<PublicUser> {
  const body = await readJsonBody(httpRequest);
  const admin = requireAdmin(body);
  const payload = body as unknown as AdminUserCreateRequest;
  const role = readRole(payload.role);
  const draft: Omit<User, "id"> = {
    login: readLogin(payload.login),
    password: readPassword(payload.password),
    fullName: readFullName(payload.fullName),
    role,
    armNumber: readArmNumber(payload.armNumber),
    isActive: true,
  };
  applyRoleFields(draft, role, payload);
  const created = insertStoredUser(draft);
  audit(
    admin.id,
    AUDIT_ACTION.userCreated,
    `Создана учётная запись ${describe(created)}, роль «${ROLE_TITLE[created.role]}», АРМ ${created.armNumber}`,
  );
  return toPublicUser(created);
}

function collectChanges(before: User, after: User): string[] {
  const changes: string[] = [];
  if (before.fullName !== after.fullName) changes.push(`ФИО «${before.fullName}» → «${after.fullName}»`);
  if (before.login !== after.login) changes.push(`логин «${before.login}» → «${after.login}»`);
  if (before.armNumber !== after.armNumber) changes.push(`АРМ ${before.armNumber} → ${after.armNumber}`);
  if (before.group !== after.group) changes.push(`группа «${before.group ?? "—"}» → «${after.group ?? "—"}»`);
  if (before.service !== after.service) {
    changes.push(`служба «${before.service ?? "—"}» → «${after.service ?? "—"}»`);
  }
  if ((before.assignedGroups ?? []).join(", ") !== (after.assignedGroups ?? []).join(", ")) {
    changes.push(
      `закреплённые группы «${(before.assignedGroups ?? []).join(", ") || "—"}» → «${(after.assignedGroups ?? []).join(", ") || "—"}»`,
    );
  }
  return changes;
}

/**
 * PATCH /admin/users/[id] — редактирование. Смена роли — отдельное событие аудита `user.roleChange`
 * (критерий приёмки 20-admin-users.md), прочие правки — `user.update`.
 */
export async function updateAdminUser(userId: string, httpRequest: Request): Promise<PublicUser> {
  const body = await readJsonBody(httpRequest);
  const admin = requireAdmin(body);
  const payload = body as unknown as AdminUserUpdateRequest;
  const before = requireUser(userId);
  const nextRole = payload.role === undefined ? before.role : readRole(payload.role);
  const updated = updateStoredUser(userId, (draft) => {
    if (payload.fullName !== undefined) draft.fullName = readFullName(payload.fullName);
    if (payload.login !== undefined) draft.login = readLogin(payload.login, userId);
    if (payload.armNumber !== undefined) draft.armNumber = readArmNumber(payload.armNumber);
    applyRoleFields(draft, nextRole, payload);
  });
  if (!updated) throw notFound(`Пользователь «${userId}» не найден`);
  if (nextRole !== before.role) {
    audit(
      admin.id,
      AUDIT_ACTION.userRoleChanged,
      `Изменена роль учётной записи ${describe(updated)}: «${ROLE_TITLE[before.role]}» → «${ROLE_TITLE[nextRole]}»`,
    );
  }
  const changes = collectChanges(before, updated);
  if (changes.length > 0) {
    audit(
      admin.id,
      AUDIT_ACTION.userUpdated,
      `Изменена учётная запись ${describe(updated)}: ${changes.join("; ")}`,
    );
  }
  return toPublicUser(updated);
}

/** Переключение User.isActive (02-roles.md: блокировка = отказ на /login). */
function setActive(userId: string, isActive: boolean, adminId: string): PublicUser {
  if (userId === adminId) throw conflict(SELF_BLOCK_MESSAGE);
  requireUser(userId);
  const updated = updateStoredUser(userId, (draft) => {
    draft.isActive = isActive;
  });
  if (!updated) throw notFound(`Пользователь «${userId}» не найден`);
  audit(
    adminId,
    isActive ? AUDIT_ACTION.userUnblocked : AUDIT_ACTION.userBlocked,
    `${isActive ? "Разблокирован" : "Заблокирован"} пользователь ${describe(updated)}`,
  );
  return toPublicUser(updated);
}

/** POST /admin/users/[id]/block | /unblock. */
export async function setAdminUserActive(
  userId: string,
  isActive: boolean,
  httpRequest: Request,
): Promise<PublicUser> {
  const admin = requireAdmin(await readJsonBody(httpRequest));
  return setActive(userId, isActive, admin.id);
}

/** POST /admin/users/[id]/toggle-active — инверсия состояния (контракт волны 1, оставлен как есть). */
export async function toggleUserActive(userId: string, httpRequest: Request): Promise<PublicUser> {
  const admin = requireAdmin(await readJsonBody(httpRequest));
  const user = requireUser(userId);
  return setActive(userId, !user.isActive, admin.id);
}

/** Мок временного пароля: не секрет, показывается администратору один раз и заменяется при входе. */
function createTemporaryPassword(): string {
  return `${TEMP_PASSWORD_PREFIX}${Math.floor(TEMP_PASSWORD_MIN + Math.random() * TEMP_PASSWORD_RANGE)}`;
}

/** POST /admin/users/[id]/reset-password — новый временный пароль + запись в аудит. */
export async function resetAdminUserPassword(
  userId: string,
  httpRequest: Request,
): Promise<AdminUserPasswordResetResponse> {
  const admin = requireAdmin(await readJsonBody(httpRequest));
  requireUser(userId);
  const temporaryPassword = createTemporaryPassword();
  const updated = updateStoredUser(userId, (draft) => {
    draft.password = temporaryPassword;
  });
  if (!updated) throw notFound(`Пользователь «${userId}» не найден`);
  audit(
    admin.id,
    AUDIT_ACTION.userPasswordReset,
    `Сброшен пароль учётной записи ${describe(updated)}; выдан временный пароль`,
  );
  return { user: toPublicUser(updated), temporaryPassword };
}
