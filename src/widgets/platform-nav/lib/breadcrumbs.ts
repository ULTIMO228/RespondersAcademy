import type { UserRole } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import type { Crumb } from "@/shared/ui/platform";

import { SECTION_TITLES } from "../config/navItems";

type CrumbRule = { prefix: string; exact?: boolean; crumbs: Crumb[] };

/* Правила от частного к общему: первое совпавшее выигрывает. Ссылка у не-последней крошки ведёт на раздел. */
const RULES: CrumbRule[] = [
  { prefix: ROUTES.studentHome, exact: true, crumbs: [{ title: "Главная" }] },
  { prefix: ROUTES.studentAssignments, crumbs: [{ title: "Задания" }] },
  { prefix: ROUTES.studentResults, exact: true, crumbs: [{ title: "Результаты" }] },
  {
    prefix: ROUTES.studentResults,
    crumbs: [{ title: "Результаты", href: ROUTES.studentResults }, { title: "Разбор попытки" }],
  },
  { prefix: ROUTES.studentAnalytics, crumbs: [{ title: "Аналитика" }] },
  { prefix: ROUTES.teacher, exact: true, crumbs: [{ title: "Главная" }] },
  {
    prefix: "/teacher/monitor",
    crumbs: [{ title: "Занятия", href: ROUTES.teacherSession }, { title: "Мониторинг обучающегося" }],
  },
  { prefix: ROUTES.teacherSession, crumbs: [{ title: "Занятия" }, { title: "Настройка занятия" }] },
  {
    prefix: ROUTES.teacherAssignmentNew,
    crumbs: [{ title: "Назначения", href: ROUTES.teacherAssignments }, { title: "Новое назначение" }],
  },
  { prefix: ROUTES.teacherAssignments, exact: true, crumbs: [{ title: "Назначения" }] },
  {
    prefix: ROUTES.teacherAssignments,
    crumbs: [{ title: "Назначения", href: ROUTES.teacherAssignments }, { title: "Назначение" }],
  },
  { prefix: ROUTES.teacherStudents, exact: true, crumbs: [{ title: "Обучающиеся" }] },
  {
    prefix: ROUTES.teacherStudents,
    crumbs: [{ title: "Обучающиеся", href: ROUTES.teacherStudents }, { title: "Профиль обучающегося" }],
  },
  {
    prefix: "/teacher/groups",
    crumbs: [{ title: "Обучающиеся", href: ROUTES.teacherStudents }, { title: "Аналитика группы" }],
  },
  { prefix: ROUTES.teacherScenarios, exact: true, crumbs: [{ title: "Сценарии" }] },
  {
    prefix: ROUTES.teacherScenarios,
    crumbs: [{ title: "Сценарии", href: ROUTES.teacherScenarios }, { title: "Редактор сценария" }],
  },
  { prefix: ROUTES.teacherReports, exact: true, crumbs: [{ title: "Отчёты" }] },
  {
    prefix: ROUTES.teacherReports,
    crumbs: [{ title: "Отчёты", href: ROUTES.teacherReports }, { title: "Отчёт о занятии" }],
  },
  { prefix: ROUTES.adminHome, exact: true, crumbs: [{ title: "Главная" }] },
  { prefix: ROUTES.adminAudit, crumbs: [{ title: "Аудит" }] },
  { prefix: ROUTES.adminSecurity, crumbs: [{ title: "Безопасность" }] },
  { prefix: ROUTES.adminUsers, crumbs: [{ title: "Пользователи" }] },
  { prefix: ROUTES.adminSystem, crumbs: [{ title: "Система" }] },
  { prefix: ROUTES.reference, crumbs: [{ title: "Справочник" }] },
  {
    prefix: ROUTES.accountSecurity,
    crumbs: [{ title: "Профиль", href: ROUTES.account }, { title: "Безопасность" }],
  },
  { prefix: ROUTES.account, crumbs: [{ title: "Профиль" }] },
];

function matches(rule: CrumbRule, pathname: string): boolean {
  if (rule.exact) return pathname === rule.prefix;
  return pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
}

/** Хлебные крошки по адресу: раздел роли, затем страница (и вложенная страница). Неизвестный адрес — только раздел. */
export function resolveCrumbs(role: UserRole, pathname: string): Crumb[] {
  const section: Crumb = { title: SECTION_TITLES[role] };
  const rule = RULES.find((candidate) => matches(candidate, pathname));
  return rule ? [section, ...rule.crumbs] : [section];
}
