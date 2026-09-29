import type { ReactNode } from "react";

import { PlatformButton } from "./form";
import { PfIcon } from "./PfIcon";
import type { PfIconName } from "./PfIcon";
import styles from "./states.module.css";

/** Скелетон загрузки: несколько строк-заглушек; для скринридера — статус «Загрузка». */
export function Skeleton({ lines = 4, label = "Загрузка…" }: { lines?: number; label?: string }) {
  return (
    <div className={styles.skeleton} role="status" aria-busy="true" aria-label={label} data-state="loading">
      <span className="visually-hidden">{label}</span>
      <div className={[styles.skeleton__line, styles["skeleton__line--title"]].join(" ")} />
      {Array.from({ length: lines }, (_, index) => (
        <div key={index} className={styles.skeleton__line} style={{ width: `${92 - index * 9}%` }} />
      ))}
    </div>
  );
}

type StateBlockProps = {
  icon: PfIconName;
  title: string;
  text?: string;
  action?: ReactNode;
  role?: "status" | "alert";
  dataState: string;
};

function StateBlock({ icon, title, text, action, role = "status", dataState }: StateBlockProps) {
  return (
    <div className={styles.state} role={role} data-state={dataState}>
      <PfIcon name={icon} size={32} className={styles.state__icon} />
      <h3 className={styles.state__title}>{title}</h3>
      {text ? <p className={styles.state__text}>{text}</p> : null}
      {action}
    </div>
  );
}

type EmptyStateProps = { title: string; text?: string; action?: ReactNode };

/** Пусто: что произошло и что делать дальше. */
export function EmptyState({ title, text, action }: EmptyStateProps) {
  return <StateBlock icon="inbox" title={title} text={text} action={action} dataState="empty" />;
}

type ErrorStateProps = { title?: string; message?: string; onRetry?: () => void };

/** Ошибка блока: причина и «Повторить»; остальные блоки страницы продолжают работать. */
export function ErrorState({ title = "Не удалось загрузить данные", message, onRetry }: ErrorStateProps) {
  return (
    <StateBlock
      icon="warning"
      title={title}
      text={message}
      role="alert"
      dataState="error"
      action={onRetry ? <PlatformButton onClick={onRetry}>Повторить</PlatformButton> : undefined}
    />
  );
}

export const SERVER_REQUIRED_TITLE = "Раздел требует подключения к серверу тренажёра";

/** Состояние «нужен сервер» (A16): платформа без бэкенда показывает его вместо данных. */
export function ServerRequiredState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateBlock
      icon="server"
      title={SERVER_REQUIRED_TITLE}
      text="Запустите тренажёр вместе с бэкендом: автономно работают только вход и панели ИИ."
      dataState="server-required"
      action={onRetry ? <PlatformButton onClick={onRetry}>Повторить</PlatformButton> : undefined}
    />
  );
}
