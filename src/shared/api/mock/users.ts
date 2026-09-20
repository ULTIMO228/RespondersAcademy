/*
 * Состав учебных групп (T3.2-03): GET /api/mock/users?role=&group= → PublicUser[] (без password).
 *
 * Зачем отдельно от /admin/users: мастер занятия и мониторинг — экраны преподавателя, а реестр админки
 * ведёт администратор (spec/02-roles.md). Данные те же (store пользователей, сид — users.json), но
 * доступ по ролям свой: преподаватель и администратор — состав групп; обучающийся — 403 (ТЗ §8).
 */
import type { PublicUser, Role } from "../types";
import { readStringParam } from "./request";
import { forbidden, validationFailed } from "./respond";
import { listStoredUsers, toPublicUser } from "./store-admin";
import { isStudentViewer } from "./viewer";
import type { MockViewer } from "./viewer";

const ROLES: readonly Role[] = ["student", "teacher", "admin"];

export const GROUPS_FORBIDDEN_MESSAGE = "Состав учебных групп доступен преподавателю и администратору";

/** Список пользователей для преподавателя: фильтры role и group; обучающемуся — 403. */
export function listUsers(params: URLSearchParams, viewer: MockViewer | null): PublicUser[] {
  if (isStudentViewer(viewer)) throw forbidden(GROUPS_FORBIDDEN_MESSAGE);
  const role = readStringParam(params, "role");
  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    throw validationFailed(`Некорректная роль: ${role}`);
  }
  const group = readStringParam(params, "group");
  return listStoredUsers()
    .filter((user) => (!role || user.role === role) && (!group || user.group === group))
    .map(toPublicUser);
}
