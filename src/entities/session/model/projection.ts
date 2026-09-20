/*
 * Per-student проекция занятия (T1.2-06). Каноническая групповая Session хранится целиком
 * (mocks/sessions.json), представление курсанта строится на лету — отдельной сущности
 * «per-student Session» нет (spec/05-data-models.md §7, примечание о проекции).
 */
import type { SessionContract } from "@/shared/api";

export type StudentSessionProjection = Pick<SessionContract, "cardFlow" | "cardEvents">;

/** Выдачи и попытки одного курсанта; курсант вне занятия → пустая проекция. Исходное занятие не мутируется. */
export function projectSessionForStudent(
  session: SessionContract,
  studentId: string,
): StudentSessionProjection {
  return {
    cardFlow: session.cardFlow.filter((item) => item.studentId === studentId),
    cardEvents: session.cardEvents.filter((attempt) => attempt.studentId === studentId),
  };
}
