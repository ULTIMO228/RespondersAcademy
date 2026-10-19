import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./ErrorMap.module.css";

export interface ErrorMapToolbarProps {
  /** Переключатель вида и кнопки действий: стоят в одну строку, на печать не выводятся. */
  children: ReactNode;
}

export function ErrorMapToolbar({ children }: ErrorMapToolbarProps) {
  return <div className={styles.toolbar}>{children}</div>;
}

export interface ErrorMapActionsProps {
  /** Адрес режима показа; без него (карта обучающегося) кнопка «Показать на экране» не выводится. */
  presentHref?: string;
  /** Адрес PDF с бэкенда (`errorMapPdfUrl`): обычная ссылка, открывается в новой вкладке, откуда печатается. */
  pdfHref: string;
  /** Адрес Excel (`errorMapXlsxUrl`): обычная ссылка со скачиванием; без него кнопки нет. */
  xlsxHref?: string;
}

/** Кнопки «Показать на экране» и «Распечатать» (PDF) для разбора на занятии (FR-021, FR-022); высота ≥ 44 px. */
export function ErrorMapActions({ presentHref, pdfHref, xlsxHref }: ErrorMapActionsProps) {
  return (
    <div className={styles.actions}>
      {presentHref ? (
        <Link className={styles.actions__link} href={presentHref}>
          Показать на экране
        </Link>
      ) : null}
      <a
        className={styles.actions__link}
        href={pdfHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Распечатать (PDF откроется в новой вкладке)"
      >
        Распечатать
      </a>
      {xlsxHref ? (
        <a className={styles.actions__link} href={xlsxHref} download>
          Скачать в Excel
        </a>
      ) : null}
    </div>
  );
}
