import type { HTMLAttributes, ReactNode } from "react";

import styles from "./Panel.module.css";

type PanelProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  actions?: ReactNode;
  headerTone?: "plain" | "dark";
  as?: "section" | "div" | "aside";
};

/** Блок светлой темы АРМ-112: фон #efefef, заголовок мелким кеглем или тёмная шапка блока. */
export function Panel({
  title,
  actions,
  headerTone = "plain",
  as: Tag = "section",
  className,
  children,
  ...rest
}: PanelProps) {
  return (
    <Tag className={[styles.panel, className].filter(Boolean).join(" ")} {...rest}>
      {title || actions ? (
        <header className={[styles.panel__header, styles[`panel__header--${headerTone}`]].join(" ")}>
          {title ? <h2 className={styles.panel__title}>{title}</h2> : null}
          {actions ? <div className={styles.panel__actions}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={styles.panel__body}>{children}</div>
    </Tag>
  );
}
