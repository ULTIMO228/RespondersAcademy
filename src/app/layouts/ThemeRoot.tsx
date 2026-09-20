import type { ReactNode } from "react";

import styles from "./ThemeRoot.module.css";

type ThemeRootProps = {
  theme: "light" | "dark";
  children: ReactNode;
};

/** Корневой контейнер темы для экранов без шапки раздела (журнал — тёмный, карточка — светлая). */
export function ThemeRoot({ theme, children }: ThemeRootProps) {
  return (
    <div className={styles.root} data-theme={theme}>
      {children}
    </div>
  );
}
