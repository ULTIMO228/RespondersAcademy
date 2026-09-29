/* Зависимости сводки преподавателя: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { getAssignment, getStudentProfile, listAssignments, listUsers } from "@/shared/api";
import type { Assignment, AssignmentDetail, PublicUser, StudentProfile } from "@/shared/api";

export type TeacherHomeApi = {
  listStudents: () => Promise<PublicUser[]>;
  profile: (studentId: string) => Promise<StudentProfile>;
  listAssignments: () => Promise<Assignment[]>;
  assignmentDetail: (assignmentId: string) => Promise<AssignmentDetail>;
};

export const teacherHomeApi: TeacherHomeApi = {
  listStudents: () => listUsers({ role: "student" }),
  profile: (studentId) => getStudentProfile(studentId),
  listAssignments: () => listAssignments(),
  assignmentDetail: (assignmentId) => getAssignment(assignmentId),
};
