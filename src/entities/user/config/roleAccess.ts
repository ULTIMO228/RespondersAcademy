import type { UserRole } from "@/shared/api";

/** Доступ роли к разделу: «+», «+ (уточнение)» или «—». */
export type RoleAccess = { allowed: boolean; note?: string };

export type RoleAccessRow = {
  route: string;
  title: string;
  access: Record<UserRole, RoleAccess>;
};

const YES: RoleAccess = { allowed: true };
const NO: RoleAccess = { allowed: false };

/** Матрица доступа к разделам — дословно по spec/000-фронт/02-roles.md (ТЗ §8, Q&A в14). */
export const ROLE_ACCESS_ROWS: RoleAccessRow[] = [
  { route: "/login", title: "Вход", access: { student: YES, teacher: YES, admin: YES } },
  { route: "/arm", title: "Главный экран АРМ-112", access: { student: YES, teacher: NO, admin: NO } },
  {
    route: "/arm/card/[id]",
    title: "Карточка происшествия (отработка)",
    access: { student: { allowed: true, note: "только свои занятия" }, teacher: NO, admin: NO },
  },
  { route: "/arm/phone", title: "Софтфон", access: { student: YES, teacher: NO, admin: NO } },
  {
    route: "/arm/operator112",
    title: "Режим «Специалист-112»",
    access: { student: YES, teacher: NO, admin: NO },
  },
  { route: "/student", title: "Кабинет обучающегося", access: { student: YES, teacher: NO, admin: NO } },
  {
    route: "/student/results",
    title: "Результаты и разбор попыток",
    access: { student: { allowed: true, note: "только свои" }, teacher: NO, admin: NO },
  },
  {
    route: "/student/analytics",
    title: "Аналитика и рекомендации",
    access: { student: { allowed: true, note: "только свои" }, teacher: NO, admin: NO },
  },
  {
    route: "/student/assignments",
    title: "Задания и экзамены",
    access: { student: { allowed: true, note: "только назначенные" }, teacher: NO, admin: NO },
  },
  { route: "/teacher", title: "Мониторинг класса", access: { student: NO, teacher: YES, admin: NO } },
  {
    route: "/teacher/monitor/[studentId]",
    title: "Экран курсанта",
    access: {
      student: NO,
      teacher: { allowed: true, note: "только просмотр, в активном занятии" },
      admin: NO,
    },
  },
  {
    route: "/teacher/scenarios",
    title: "Сценарии и эталоны",
    access: { student: NO, teacher: YES, admin: NO },
  },
  {
    route: "/teacher/session",
    title: "Проведение занятия",
    access: { student: NO, teacher: YES, admin: NO },
  },
  {
    route: "/teacher/reports",
    title: "Отчёты и аналитика",
    access: { student: NO, teacher: YES, admin: NO },
  },
  { route: "/reference", title: "Справочник", access: { student: YES, teacher: YES, admin: YES } },
  { route: "/account", title: "Профиль и безопасность", access: { student: YES, teacher: YES, admin: YES } },
  { route: "/admin/users", title: "Пользователи и роли", access: { student: NO, teacher: NO, admin: YES } },
  {
    route: "/admin/system",
    title: "Сервисы, настройки, журналы",
    access: { student: NO, teacher: NO, admin: YES },
  },
];

export const ROLE_ORDER: UserRole[] = ["student", "teacher", "admin"];
