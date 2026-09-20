import { SessionWizard } from "@/features/session-wizard";
import type { SessionWizardApi } from "@/features/session-wizard";
import { getSessionUser } from "@/entities/user/index.server";
import type { PublicUser } from "@/shared/api";

import styles from "./TeacherSessionPage.module.css";

type TeacherSessionScreenProps = {
  teacher: PublicUser;
  /** Подмена клиента мок-слоя (тесты). */
  api?: SessionWizardApi;
};

/** Экран мастера занятия: шапка преподавателя + мастер настройки (данные грузит клиент мок-слоя). */
export function TeacherSessionScreen({ teacher, api }: TeacherSessionScreenProps) {
  return (
    <div className={styles.session}>
      <header className={styles.session__header}>
        <h1 className={styles.session__title}>Настройка занятия</h1>
        <p className={styles.session__note}>Преподаватель {teacher.fullName} · сценарии Б и В (ТЗ §10)</p>
      </header>
      <SessionWizard teacherId={teacher.id} api={api} />
    </div>
  );
}

/**
 * `/teacher/session` — мастер настройки занятия (spec/04-pages/12-teacher-session.md).
 * Серверный компонент: преподаватель — пользователь сессии (гвард роли — proxy + лэйаут раздела).
 */
export async function TeacherSessionPage() {
  const sessionUser = await getSessionUser();
  return sessionUser ? <TeacherSessionScreen teacher={sessionUser.user} /> : null;
}
