import type { ReactNode } from "react";

import { ACCESS_MESSAGES } from "../lib/resolveAccess";
import type { MonitorAccess } from "../lib/resolveAccess";

import styles from "./TeacherMonitorPage.module.css";

type AccessDeniedProps = {
  access: Exclude<MonitorAccess, "granted">;
  backLink: ReactNode;
};

/**
 * Вежливый отказ монитора (T3.3-09): вне активного занятия или для чужого курсанта — без данных,
 * с переходом на `/teacher`. Экран не содержит ни одного контрола вмешательства.
 */
export function AccessDenied({ access, backLink }: AccessDeniedProps) {
  if (access === "loading") {
    return (
      <p className={styles.monitor__empty} role="status">
        Проверяем занятие…
      </p>
    );
  }
  return (
    <div className={styles.monitor__empty} role="alert">
      <p>{ACCESS_MESSAGES[access]}</p>
      {backLink}
    </div>
  );
}
