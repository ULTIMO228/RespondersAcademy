import { ROUTES } from "@/shared/config";
import type { UserRole } from "@/shared/api";

export type NavItem = {
  href: string;
  title: string;
};

/* Разделы по ролям (spec/000-фронт/02-roles.md «Матрица доступа к разделам»). */
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { href: ROUTES.arm, title: "журнал" },
    { href: ROUTES.armPhone, title: "софтфон" },
    { href: ROUTES.armProgress, title: "прогресс" },
    { href: ROUTES.armHelp, title: "справка" },
  ],
  teacher: [
    { href: ROUTES.teacher, title: "мониторинг" },
    { href: ROUTES.teacherScenarios, title: "сценарии" },
    { href: ROUTES.teacherSession, title: "занятие" },
    { href: ROUTES.teacherReports, title: "отчёты" },
  ],
  admin: [
    { href: ROUTES.adminUsers, title: "пользователи" },
    { href: ROUTES.adminSystem, title: "система" },
  ],
};
