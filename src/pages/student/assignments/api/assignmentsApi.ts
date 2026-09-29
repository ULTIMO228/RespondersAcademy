/* Зависимости страницы заданий: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { getAssignment, listAssignments, startAssignment } from "@/shared/api";
import type { Assignment, AssignmentDetail, StartAssignmentResult } from "@/shared/api";

export type StudentAssignmentsApi = {
  list: () => Promise<Assignment[]>;
  detail: (assignmentId: string) => Promise<AssignmentDetail>;
  start: (assignmentId: string) => Promise<StartAssignmentResult>;
};

export const studentAssignmentsApi: StudentAssignmentsApi = {
  list: () => listAssignments(),
  detail: (assignmentId) => getAssignment(assignmentId),
  start: (assignmentId) => startAssignment(assignmentId),
};
