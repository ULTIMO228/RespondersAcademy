import type { PublicUser, TrainingProfile } from "@/shared/api";
import { allowsMode } from "@/shared/config";

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

/**
 * Разбивка выбранных по профилю режима (spec/008): курсант с профилем другого режима пропускается.
 * Шаг «Обучающиеся» идёт до выбора режима, поэтому пропуск показывается на шаге «Режим и формат».
 */
export function splitByMode(
  students: PublicUser[],
  mode: TrainingProfile,
): { allowed: PublicUser[]; skipped: PublicUser[] } {
  const allowed: PublicUser[] = [];
  const skipped: PublicUser[] = [];
  for (const user of students) (allowsMode(user, mode) ? allowed : skipped).push(user);
  return { allowed, skipped };
}
