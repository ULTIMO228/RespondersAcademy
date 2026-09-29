import { SessionWizard } from "@/features/session-wizard";
import type { SessionWizardApi } from "@/features/session-wizard";
import { getSessionUser } from "@/entities/user/index.server";
import type { PublicUser } from "@/shared/api";
import { PageHeader } from "@/shared/ui/platform";

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
      <PageHeader
        title="Настройка занятия"
        description={`Преподаватель ${teacher.fullName} · сценарии Б и В (ТЗ §10)`}
      />
      <SessionWizard teacherId={teacher.id} api={api} />
    </div>
  );
}

/**
 * `/teacher/session` — мастер настройки занятия (spec/000-фронт/04-pages/12-teacher-session.md).
 * Серверный компонент: преподаватель — пользователь сессии (гвард роли — proxy + лэйаут раздела).
 */
export async function TeacherSessionPage() {
  const sessionUser = await getSessionUser();
  return sessionUser ? <TeacherSessionScreen teacher={sessionUser.user} /> : null;
}
