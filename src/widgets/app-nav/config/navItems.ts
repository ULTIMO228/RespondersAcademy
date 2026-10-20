import { ROUTES } from "@/shared/config";
import type { Specialization, UserRole } from "@/shared/api";

export type NavItem = {
  href: string;
  title: string;
  /** Вкладка зоны: показывается только обучающемуся с этой специализацией (спека 019); без поля — всем. */
  zone?: Specialization;
};

/* Разделы по ролям (spec/000-фронт/02-roles.md «Матрица доступа к разделам»). */
export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
  student: [
    { href: ROUTES.arm, title: "журнал", zone: "dds" },
    { href: ROUTES.armPhone, title: "софтфон", zone: "dds" },
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

/** Вкладки роли с учётом специализации: вкладки чужой зоны не показываются. `zones` не задан — без фильтра. */
export function navItemsFor(role: UserRole, zones?: readonly Specialization[]): NavItem[] {
  return NAV_ITEMS[role].filter((item) => !item.zone || !zones || zones.includes(item.zone));
}
