import { requiredSpecializations } from "@/entities/assignment";
import type { PublicUser, TrainingMode } from "@/shared/api";

/** Группа для обучающихся без группы: подпись в списке и ключ в наборе закреплённых групп. */
export const NO_GROUP = "Без группы";

/**
 * Обучающиеся, которых мастер может назначить: активные и из закреплённых за преподавателем групп.
 * Сервер повторяет проверку активности и специализации при создании задания.
 */
export function assignableStudents(
  students: PublicUser[],
  assignedGroups: string[] | undefined,
  trainingMode: TrainingMode,
): PublicUser[] {
  const allowed = new Set(assignedGroups ?? []);
  const required = requiredSpecializations(trainingMode);
  return students.filter(
    (user) =>
      user.isActive &&
      user.role === "student" &&
      allowed.has(user.group ?? NO_GROUP) &&
      required.every((specialization) => (user.specializations ?? ["dds"]).includes(specialization)),
  );
}
