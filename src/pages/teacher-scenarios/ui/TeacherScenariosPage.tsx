import { buildCardIndex } from "@/features/scenario-builder";
import { TRAINING_CARD_FIXTURE_IDS } from "@/entities/session";
import { getSessionUser } from "@/entities/user/index.server";
import { cards, classifier } from "@/shared/api";

import { TeacherScenariosScreen } from "./TeacherScenariosScreen";

import styles from "./TeacherScenariosPage.module.css";

/**
 * `/teacher/scenarios` — сценарии и эталоны (spec/04-pages/11-teacher-scenarios.md).
 * Серверный компонент: преподаватель — пользователь сессии (гвард — proxy + лэйаут раздела).
 * Здесь же считается выжимка по учебным карточкам (сам classifier.json — 3,5 МБ — в браузер не уезжает);
 * изменяемые данные (сценарии, материалы, привязка) экран грузит из мок-API.
 */
export async function TeacherScenariosPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;
  const cardIndex = buildCardIndex(cards, classifier, (cardId) => TRAINING_CARD_FIXTURE_IDS[cardId]);
  return (
    <div className={styles.scenarios}>
      <header className={styles.scenarios__header}>
        <h1 className={styles.scenarios__title}>Сценарии и эталоны</h1>
        <p className={styles.scenarios__note}>
          Шаблоны по 32 билетам и генеративные вариации. В занятие назначаются только утверждённые сценарии.
        </p>
      </header>
      <TeacherScenariosScreen teacherId={sessionUser.user.id} cardIndex={cardIndex} />
    </div>
  );
}
