/* Зависимости сводки преподавателя: доменные функции shared/api за интерфейсом (в тестах подменяются целиком). */
import { getStudentProfile, listAssignments, listUsers } from "@/shared/api";
import type { Assignment, PublicUser, StudentProfile } from "@/shared/api";

export type TeacherHomeApi = {
  listStudents: () => Promise<PublicUser[]>;
  profile: (studentId: string) => Promise<StudentProfile>;
  listAssignments: () => Promise<Assignment[]>;
};

export const teacherHomeApi: TeacherHomeApi = {
  listStudents: () => listUsers({ role: "student" }),
  profile: (studentId) => getStudentProfile(studentId),
  listAssignments: () => listAssignments(),
};
