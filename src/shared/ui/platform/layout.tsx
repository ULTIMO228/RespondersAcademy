import type { ReactNode } from "react";

import { PfIcon } from "./PfIcon";
import styles from "./layout.module.css";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

/** Заголовок страницы платформы: h1, пояснение и действия справа. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div>
        <h1 className={styles.header__title}>{title}</h1>
        {description ? <p className={styles.header__description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.header__actions}>{actions}</div> : null}
    </header>
  );
}

type CardProps = {
  title?: string;
  /** Правая часть шапки карточки: ссылка «Вся аналитика», бейдж «ИИ». */
  actions?: ReactNode;
  accent?: boolean;
  children: ReactNode;
  "aria-label"?: string;
};

/** Карточка: белая поверхность с волосяной границей (в покое без тени). */
export function Card({ title, actions, accent = false, children, "aria-label": ariaLabel }: CardProps) {
  return (
    <section
      className={[styles.card, accent ? styles["card--accent"] : ""].filter(Boolean).join(" ")}
      aria-label={ariaLabel ?? title}
    >
      {title || actions ? (
        <div className={styles.card__head}>
          {title ? <h2 className={styles.card__title}>{title}</h2> : <span />}
          {actions ? <div className={styles.card__actions}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Панель показателей: одна поверхность с разделителями (не ряд одинаковых карточек). */
export function StatGroup({ children }: { children: ReactNode }) {
  return <dl className={styles.stats}>{children}</dl>;
}

export type StatTone = "default" | "good" | "bad";

type StatTileProps = {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: StatTone;
};

/** Показатель: крупное число (tabular-nums), подпись и норматив; цвет несёт смысл только вместе с текстом заметки. */
export function StatTile({ label, value, note, tone = "default" }: StatTileProps) {
  return (
    <div className={styles.stat}>
      <dt className={styles.stat__label}>{label}</dt>
      <dd className={styles.stat__body}>
        <div
          className={[
            styles.stat__value,
            tone === "good" ? styles["stat__value--good"] : "",
            tone === "bad" ? styles["stat__value--bad"] : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {value}
        </div>
        {note ? (
          <div
            className={[styles.stat__note, tone === "bad" ? styles["stat__note--bad"] : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {note}
          </div>
        ) : null}
      </dd>
    </div>
  );
}

export type AlertTone = "info" | "success" | "warning" | "danger";

const ALERT_ICON = { info: "info", success: "info", warning: "warning", danger: "warning" } as const;

type AlertProps = {
  tone?: AlertTone;
  children: ReactNode;
  /** Сообщения о результате действия — status; ошибки, требующие внимания, — alert. */
  role?: "status" | "alert";
};

export function Alert({ tone = "info", children, role = "status" }: AlertProps) {
  return (
    <div className={[styles.alert, styles[`alert--${tone}`]].join(" ")} role={role}>
      <PfIcon name={ALERT_ICON[tone]} size={18} className={styles.alert__icon} />
      <div>{children}</div>
    </div>
  );
}

export type TagTone = "neutral" | "info" | "success" | "warning" | "danger" | "ai";

/** Метка состояния/режима. Тон `ai` — бейдж «ИИ»: ИИ-контент в платформе помечается всегда (Q&A в3). */
export function Tag({ tone = "neutral", children }: { tone?: TagTone; children: ReactNode }) {
  return <span className={[styles.tag, styles[`tag--${tone}`]].join(" ")}>{children}</span>;
}

/** Бейдж «ИИ» платформы. */
export function AiTag({ title }: { title?: string }) {
  return (
    <span className={[styles.tag, styles["tag--ai"]].join(" ")} title={title}>
      ИИ
    </span>
  );
}

type ProgressBarProps = {
  /** 0–100. */
  value: number;
  label: string;
  tone?: "default" | "success" | "warning" | "danger";
};

export function ProgressBar({ value, label, tone = "default" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={[styles.progress, tone === "default" ? "" : styles[`progress--${tone}`]]
        .filter(Boolean)
        .join(" ")}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <div className={styles.progress__bar} style={{ width: `${clamped}%` }} />
    </div>
  );
}
