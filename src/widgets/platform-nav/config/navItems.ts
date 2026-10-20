import type { Specialization, UserRole } from "@/shared/api";
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
  /** Пункт входа в зону симулятора: показывается обучающемуся с этой специализацией (спека 007). */
  zone?: Specialization;
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
    { href: ROUTES.studentScenarios, title: "Сценарии", icon: "doc" },
    { href: ROUTES.studentResults, title: "Результаты", icon: "results" },
    { href: ROUTES.studentAnalytics, title: "Аналитика", icon: "analytics" },
    REFERENCE,
    {
      href: ROUTES.armOperator112,
      title: "Открыть АРМ",
      icon: "sim",
      outlined: true,
      separatorBefore: true,
      activeOn: [],
      zone: "operator112",
    },
    { href: ROUTES.arm, title: "Открыть АРМ", icon: "sim", outlined: true, activeOn: [], zone: "dds" },
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
    { href: ROUTES.teacherPerformance, title: "Успеваемость", icon: "results" },
    { href: ROUTES.teacherErrorMap, title: "Карта ошибок", icon: "analytics" },
    { href: ROUTES.teacherRating, title: "Рейтинг", icon: "results" },
    { href: ROUTES.teacherScenarios, title: "Сценарии", icon: "doc" },
    { href: ROUTES.teacherConstructor, title: "Конструктор", icon: "flow" },
    { href: ROUTES.teacherReports, title: "Отчёты", icon: "results" },
    REFERENCE,
    PROFILE,
  ],
  admin: [
    { href: ROUTES.adminHome, title: "Главная", icon: "home", exact: true },
    { href: ROUTES.adminUsers, title: "Пользователи", icon: "users" },
    { href: ROUTES.adminPerformance, title: "Успеваемость", icon: "results" },
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

const ZONE_SUFFIX: Record<Specialization, string> = { operator112: "112", dds: "ДДС" };

/**
 * Пункты боковой панели с учётом специализации: вход в АРМ только в свои зоны. При двух зонах пункты подписаны («АРМ 112»,
 * «АРМ ДДС»), при одной — «Открыть АРМ». `zones` не задан — без фильтра по зонам.
 */
export function resolvePlatformNav(role: UserRole, zones?: readonly Specialization[]): PlatformNavEntry[] {
  const visible = PLATFORM_NAV[role].filter((entry) => !entry.zone || !zones || zones.includes(entry.zone));
  const zoneEntries = visible.filter((entry) => entry.zone);
  return visible.map((entry) => {
    if (!entry.zone) return entry;
    const isFirst = entry === zoneEntries[0];
    return {
      ...entry,
      title: zoneEntries.length > 1 ? `${entry.title} ${ZONE_SUFFIX[entry.zone]}` : entry.title,
      separatorBefore: isFirst,
    };
  });
}

/** Разделы-рабочие места во весь экран: боковая панель свёрнута до значков (design-concept.md §4). */
export const WORKSPACE_ROUTES: string[] = [ROUTES.teacherConstructor];

export function isWorkspaceRoute(pathname: string): boolean {
  return WORKSPACE_ROUTES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
