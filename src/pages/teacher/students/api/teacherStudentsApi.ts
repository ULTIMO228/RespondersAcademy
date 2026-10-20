/* Зависимости страниц «Обучающиеся»: доменные функции shared/api за интерфейсом. */
import {
  getErrorMapStudent,
  getStudentProfile,
  getStudentStats,
  listUsers,
  updateStudentSpecializations,
} from "@/shared/api";
import type {
  ErrorMapMode,
  ErrorMapResponse,
  PublicUser,
  Specialization,
  StudentProfile,
  StudentStats,
} from "@/shared/api";

export type TeacherStudentsApi = {
  listStudents: () => Promise<PublicUser[]>;
  profile: (studentId: string) => Promise<StudentProfile>;
  /** Полная статистика за всё время (спека 006); необязательна — в старых тестах не подменяется. */
  stats?: (studentId: string) => Promise<StudentStats>;
  /** Карта ошибок обучающегося по режиму — источник «слабых этапов» (спека 003). */
  errorMap?: (studentId: string, mode: ErrorMapMode) => Promise<ErrorMapResponse>;
  /** Смена специализации обучающегося своей группы (спека 007). */
  setSpecializations: (studentId: string, specializations: Specialization[]) => Promise<PublicUser>;
};

export const teacherStudentsApi: TeacherStudentsApi = {
  listStudents: () => listUsers({ role: "student" }),
  profile: (studentId) => getStudentProfile(studentId),
  stats: (studentId) => getStudentStats(studentId, { mode: "all", period: "all" }),
  errorMap: (studentId, mode) => getErrorMapStudent(studentId, { mode, period: "all" }),
  setSpecializations: updateStudentSpecializations,
};
