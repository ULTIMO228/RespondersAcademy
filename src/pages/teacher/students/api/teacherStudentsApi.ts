/* Зависимости страниц «Обучающиеся»: доменные функции shared/api за интерфейсом. */
import { getStudentProfile, listUsers } from "@/shared/api";
import type { PublicUser, StudentProfile } from "@/shared/api";

export type TeacherStudentsApi = {
  listStudents: () => Promise<PublicUser[]>;
  profile: (studentId: string) => Promise<StudentProfile>;
};

export const teacherStudentsApi: TeacherStudentsApi = {
  listStudents: () => listUsers({ role: "student" }),
  profile: (studentId) => getStudentProfile(studentId),
};
