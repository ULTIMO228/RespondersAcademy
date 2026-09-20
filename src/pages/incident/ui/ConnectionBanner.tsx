import styles from "./IncidentPage.module.css";

type ConnectionBannerProps = {
  isOnline: boolean;
  pendingCount: number;
  lastError: string | null;
};

/** Баннер потери соединения (ТЗ §7): поверх интерфейса, доступен скринридеру; число действий в буфере. */
export function ConnectionBanner({ isOnline, pendingCount, lastError }: ConnectionBannerProps) {
  return (
    <>
      {isOnline ? null : (
        <div className={styles.page__banner} role="status" aria-live="polite">
          Соединение потеряно — восстанавливаем…
          {pendingCount > 0 ? ` Не отправлено действий: ${pendingCount} (сохранены локально).` : null}
        </div>
      )}
      {lastError ? (
        <div className={styles.page__banner} role="alert" data-tone="error">
          Действие из буфера не принято сервером: {lastError}
        </div>
      ) : null}
    </>
  );
}
