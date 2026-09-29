import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { Panel } from "@/shared/ui";

import styles from "./DevMapPage.module.css";

type ScreenLink = { href: string; title: string; spec: string };

const SCREEN_GROUPS: { title: string; screens: ScreenLink[] }[] = [
  {
    title: "Вход",
    screens: [{ href: ROUTES.login, title: "Вход в систему", spec: "04-pages/00-auth.md" }],
  },
  {
    title: "Обучающийся (АРМ-112)",
    screens: [
      { href: ROUTES.arm, title: "Поиск происшествий", spec: "04-pages/01-arm-main.md" },
      {
        href: ROUTES.armCard("card-36814845"),
        title: "Карточка происшествия",
        spec: "04-pages/02-arm-card.md",
      },
      {
        href: `${ROUTES.armCard("card-36814845")}?state=exceeded`,
        title: "Карточка — превышение норматива",
        spec: "02-arm-card.md п. 1",
      },
      { href: ROUTES.armPhone, title: "Софтфон", spec: "04-pages/03-arm-softphone.md" },
      { href: ROUTES.armOperator112, title: "Специалист-112", spec: "spec/001-ai" },
    ],
  },
  {
    title: "Платформа: обучающийся",
    screens: [
      { href: ROUTES.studentHome, title: "Главная", spec: "002/07-platform-shell.md" },
      { href: ROUTES.studentAssignments, title: "Задания", spec: "002/07-platform-shell.md" },
      { href: ROUTES.studentResults, title: "Результаты", spec: "002/07-platform-shell.md" },
      { href: ROUTES.studentAnalytics, title: "Аналитика", spec: "002/07-platform-shell.md" },
    ],
  },
  {
    title: "Платформа: общие",
    screens: [
      { href: ROUTES.reference, title: "Справочник", spec: "002/07-platform-shell.md" },
      { href: ROUTES.account, title: "Профиль", spec: "002/07-platform-shell.md" },
      { href: ROUTES.accountSecurity, title: "Безопасность", spec: "002/07-platform-shell.md" },
    ],
  },
  {
    title: "Преподаватель",
    screens: [
      { href: ROUTES.teacher, title: "Мониторинг класса", spec: "04-pages/10-teacher-dashboard.md" },
      {
        href: ROUTES.teacherMonitor("u-005"),
        title: "Экран курсанта",
        spec: "04-pages/10-teacher-dashboard.md",
      },
      {
        href: ROUTES.teacherScenarios,
        title: "Сценарии и эталоны",
        spec: "04-pages/11-teacher-scenarios.md",
      },
      {
        href: ROUTES.teacherScenario("s-032"),
        title: "Редактор сценария",
        spec: "04-pages/11-teacher-scenarios.md",
      },
      { href: ROUTES.teacherSession, title: "Проведение занятия", spec: "04-pages/12-teacher-session.md" },
      { href: ROUTES.teacherReports, title: "Отчёты занятий", spec: "04-pages/13-teacher-reports.md" },
      {
        href: ROUTES.teacherReport("ses-2026-09-16-01"),
        title: "Отчёт по занятию",
        spec: "04-pages/13-teacher-reports.md",
      },
    ],
  },
  {
    title: "Администратор",
    screens: [
      { href: ROUTES.adminUsers, title: "Пользователи и роли", spec: "04-pages/20-admin-users.md" },
      { href: ROUTES.adminSystem, title: "Система", spec: "04-pages/21-admin-system.md" },
    ],
  },
  {
    title: "Разработка",
    screens: [{ href: ROUTES.devUi, title: "Полка UI-примитивов", spec: "12-tasks.md T0.1-09/10" }],
  },
];

/** Карта экранов прототипа: симулятор АРМ-112 и платформа — для показа и ручной проверки. */
export function DevMapPage() {
  return (
    <div className={styles.map}>
      <h1 className={styles.map__title}>Карта экранов прототипа АРМ-112</h1>
      <div className={styles.map__grid}>
        {SCREEN_GROUPS.map((group) => (
          <Panel key={group.title} title={group.title}>
            <ul className={styles.map__list}>
              {group.screens.map((screen) => (
                <li key={screen.href}>
                  <Link href={screen.href}>{screen.title}</Link>
                  <span className={styles.map__spec}>
                    {screen.href} · {screen.spec}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>
    </div>
  );
}
