/* Зависимости страниц «Обучающиеся»: доменные функции shared/api за интерфейсом. */
import { getStudentProfile, listUsers, updateStudentSpecializations } from "@/shared/api";
import type { PublicUser, Specialization, StudentProfile } from "@/shared/api";

export type TeacherStudentsApi = {
  listStudents: () => Promise<PublicUser[]>;
  profile: (studentId: string) => Promise<StudentProfile>;
  setSpecializations: (studentId: string, specializations: Specialization[]) => Promise<PublicUser>;
};

export const teacherStudentsApi: TeacherStudentsApi = {
  listStudents: () => listUsers({ role: "student" }),
  profile: (studentId) => getStudentProfile(studentId),
  setSpecializations: updateStudentSpecializations,
};
