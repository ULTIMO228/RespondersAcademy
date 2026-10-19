import type { PublicUser } from "@/shared/api";

/** Группа для обучающихся без группы: подпись в списке и ключ в наборе закреплённых групп. */
export const NO_GROUP = "Без группы";

/**
 * Обучающиеся, которых мастер может назначить: активные и из закреплённых за преподавателем групп.
 * Пустой набор групп — ни одного обучающегося. Сервер проверяет роль и активность, но не группу (см. R12),
 * поэтому это ограничение действует только здесь и на шаге «Обучающиеся».
 */
export function assignableStudents(
  students: PublicUser[],
  assignedGroups: string[] | undefined,
): PublicUser[] {
  const allowed = new Set(assignedGroups ?? []);
  return students.filter(
    (user) => user.isActive && user.role === "student" && allowed.has(user.group ?? NO_GROUP),
  );
}
