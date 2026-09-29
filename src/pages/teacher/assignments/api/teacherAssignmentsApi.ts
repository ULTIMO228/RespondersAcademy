/* Зависимости страниц назначений преподавателя: доменные функции shared/api за интерфейсом. */
import { finishAssignment, getAssignment, listAssignments, listUsers } from "@/shared/api";
import type { Assignment, AssignmentDetail, PublicUser } from "@/shared/api";

export type TeacherAssignmentsApi = {
  list: () => Promise<Assignment[]>;
  detail: (assignmentId: string) => Promise<AssignmentDetail>;
  finish: (assignmentId: string) => Promise<Assignment>;
  listStudents: () => Promise<PublicUser[]>;
};

export const teacherAssignmentsApi: TeacherAssignmentsApi = {
  list: () => listAssignments(),
  detail: (assignmentId) => getAssignment(assignmentId),
  finish: (assignmentId) => finishAssignment(assignmentId),
  listStudents: () => listUsers({ role: "student" }),
};
