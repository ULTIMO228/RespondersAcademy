import { Button } from "../button";

import styles from "./ServerRequired.module.css";

type ServerRequiredProps = {
  /** Название раздела для заголовка состояния: «Задания», «Справочник». */
  section?: string;
  /** Повторный запрос после подключения сервера; без обработчика кнопки нет. */
  onRetry?: () => void;
};

const MESSAGE = "Раздел требует подключения к серверу тренажёра";
const HINT = "Фронт запущен без BACKEND_URL: данные раздела отдаёт только сервер тренажёра.";

/** Состояние экрана для ServerRequiredError (спека 002, FR-003): не ошибка сети и не пустой список. */
export function ServerRequired({ section, onRetry }: ServerRequiredProps) {
  return (
    <div className={styles.state} role="status" data-state="server-required">
      {section ? <h2 className={styles.state__section}>{section}</h2> : null}
      <p className={styles.state__message}>{MESSAGE}</p>
      <p className={styles.state__hint}>{HINT}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  );
}
