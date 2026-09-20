import Link from "next/link";

import type { LiveSessionState } from "@/widgets/monitor-grid";
import { ROUTES } from "@/shared/config";
import { Button } from "@/shared/ui";

import styles from "./SessionPlaceholder.module.css";

type SessionPlaceholderProps = {
  state: LiveSessionState;
  onRetry: () => void;
};

/** Состояния дашборда без данных: загрузка, нет идущего занятия (переход в мастер), ошибка загрузки. */
export function SessionPlaceholder({ state, onRetry }: SessionPlaceholderProps) {
  if (state.status === "loading") {
    return (
      <p className={styles.placeholder} role="status">
        Загружаем занятие…
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <div className={styles.placeholder} role="alert">
        <p>{state.message}</p>
        <Button variant="primary" onClick={onRetry}>
          Повторить
        </Button>
      </div>
    );
  }
  return (
    <div className={styles.placeholder}>
      <h1 className={styles.placeholder__title}>Занятие не идёт</h1>
      <p>
        Мониторинг класса доступен во время занятия: соберите группу и запустите занятие в мастере, после
        старта здесь появятся плитки курсантов, лента событий и очередь выдачи.
      </p>
      <Link href={ROUTES.teacherSession} className={styles.placeholder__action}>
        Перейти в мастер занятия
      </Link>
    </div>
  );
}
