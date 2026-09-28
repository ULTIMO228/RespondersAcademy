import { getSessionUser } from "@/entities/user/index.server";

import { ReportsJournal } from "./ReportsJournal";

import styles from "./TeacherReportsPage.module.css";

/**
 * `/teacher/reports` — журнал отчётов (spec/000-фронт/04-pages/13-teacher-reports.md). Серверный компонент:
 * преподаватель — пользователь сессии (гвард — proxy + лэйаут), данные грузит клиент из мок-API.
 */
export async function TeacherReportsPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  return (
    <div className={styles.reports}>
      <header className={styles.reports__header}>
        <h1 className={styles.reports__title}>Отчёты занятий</h1>
      </header>
      <ReportsJournal teacherId={sessionUser.user.id} />
    </div>
  );
}
