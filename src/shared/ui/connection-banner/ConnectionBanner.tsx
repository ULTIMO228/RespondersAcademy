import styles from "./ConnectionBanner.module.css";

type ConnectionBannerProps = {
  isOnline: boolean;
  /** Пояснение под сообщением: что происходит с уже загруженными данными. */
  note?: string;
  /** Показ короткого подтверждения после восстановления связи. */
  isRestored?: boolean;
};

const LOST_MESSAGE = "Соединение потеряно — восстанавливаем…";
const RESTORED_MESSAGE = "Соединение восстановлено — данные догружены";
const DEFAULT_NOTE = "Данные на экране сохранены, таймеры продолжают идти";

/**
 * Баннер связи (ТЗ §7 «Сбой сети»): при обрыве — поверх интерфейса, данные и таймеры не сбрасываются;
 * после восстановления — короткое подтверждение. Доступен скринридеру (role="status").
 */
export function ConnectionBanner({
  isOnline,
  note = DEFAULT_NOTE,
  isRestored = false,
}: ConnectionBannerProps) {
  if (isOnline && !isRestored) return null;
  const modifier = isOnline ? styles["banner--restored"] : "";
  return (
    <div
      className={[styles.banner, modifier].join(" ")}
      role="status"
      aria-live="polite"
      data-online={isOnline}
    >
      <span>{isOnline ? RESTORED_MESSAGE : LOST_MESSAGE}</span>
      {isOnline ? null : <span className={styles.banner__note}>{note}</span>}
    </div>
  );
}
