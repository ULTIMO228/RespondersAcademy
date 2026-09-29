import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import type { PfIconName } from "@/shared/ui/platform";

export type PlatformNavEntry = {
  href: string;
  title: string;
  icon: PfIconName;
  /** Пункт активен на этих путях (по префиксу сегментов); без списка — на собственном href по префиксу. */
  activeOn?: string[];
  /** Активен только на собственном href (главная роли не «захватывает» вложенные разделы). */
  exact?: boolean;
  outlined?: boolean;
  separatorBefore?: boolean;
};

const REFERENCE: PlatformNavEntry = { href: ROUTES.reference, title: "Справочник", icon: "book" };
const PROFILE: PlatformNavEntry = {
  href: ROUTES.account,
  title: "Профиль",
  icon: "user",
  separatorBefore: true,
};

/**
 * Пункты боковой панели по ролям (07-platform-shell.md §3.2). Только реализованные разделы.
 */
export const PLATFORM_NAV: Record<UserRole, PlatformNavEntry[]> = {
  student: [
    { href: ROUTES.studentHome, title: "Главная", icon: "home", exact: true },
    { href: ROUTES.studentAssignments, title: "Задания", icon: "tasks" },
    { href: ROUTES.studentResults, title: "Результаты", icon: "results" },
    { href: ROUTES.studentAnalytics, title: "Аналитика", icon: "analytics" },
    REFERENCE,
    {
      href: ROUTES.arm,
      title: "Открыть АРМ",
      icon: "sim",
      outlined: true,
      separatorBefore: true,
      activeOn: [],
    },
    { ...PROFILE, separatorBefore: false },
  ],
  teacher: [
    { href: ROUTES.teacher, title: "Главная", icon: "home", exact: true },
    { href: ROUTES.teacherAssignments, title: "Назначения", icon: "tasks" },
    {
      href: ROUTES.teacherSession,
      title: "Занятия",
      icon: "pulse",
      activeOn: [ROUTES.teacherSession, "/teacher/monitor"],
    },
    {
      href: ROUTES.teacherStudents,
      title: "Обучающиеся",
      icon: "users",
      activeOn: [ROUTES.teacherStudents, "/teacher/groups"],
    },
    { href: ROUTES.teacherScenarios, title: "Сценарии", icon: "doc" },
    { href: ROUTES.teacherReports, title: "Отчёты", icon: "results" },
    REFERENCE,
    PROFILE,
  ],
  admin: [
    { href: ROUTES.adminHome, title: "Главная", icon: "home", exact: true },
    { href: ROUTES.adminUsers, title: "Пользователи", icon: "users" },
    { href: ROUTES.adminAudit, title: "Аудит", icon: "log" },
    { href: ROUTES.adminSecurity, title: "Безопасность", icon: "shield" },
    { href: ROUTES.adminSystem, title: "Система", icon: "server" },
    REFERENCE,
    PROFILE,
  ],
};

export const SECTION_TITLES: Record<UserRole, string> = {
  student: "Кабинет обучающегося",
  teacher: "Кабинет преподавателя",
  admin: "Администрирование",
};

function startsWithSegments(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isNavEntryActive(entry: PlatformNavEntry, pathname: string): boolean {
  if (entry.exact) return pathname === entry.href;
  const prefixes = entry.activeOn ?? [entry.href];
  return prefixes.some((prefix) => startsWithSegments(pathname, prefix));
}
