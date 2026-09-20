import Link from "next/link";
import type { ReactNode } from "react";

import { ROUTES } from "@/shared/config";

import styles from "./OperatorPanel.module.css";

type NavTab = {
  href: string;
  label: string;
  hint: string;
  icon: ReactNode;
};

/* Пиктограммы вкладок — в стиле ряда «журнал · экран · статистика · вики» на p12_Image66 (в наборе icons/ их нет). */
const JOURNAL_ICON = (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path d="M3 5h12M3 9h12M3 13h12" />
  </svg>
);
const PHONE_ICON = (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path d="M3.5 11V9a5.5 5.5 0 0111 0v2M3.5 10.5h2.5v4H3.5zM12 10.5h2.5v4H12z" />
  </svg>
);
const PROGRESS_ICON = (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2.5 3v12.5H16M5.5 13V9.5M9 13V6.5M12.5 13V8" />
  </svg>
);
const HELP_ICON = (
  <svg viewBox="0 0 18 18" aria-hidden="true">
    <circle cx="9" cy="9" r="6.5" />
    <path d="M7 7.2a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M9 12.3v.4" />
  </svg>
);

const NAV_TABS: NavTab[] = [
  { href: ROUTES.arm, label: "журнал", hint: "Журнал происшествий", icon: JOURNAL_ICON },
  { href: ROUTES.armPhone, label: "софтфон", hint: "Софтфон", icon: PHONE_ICON },
  { href: ROUTES.armProgress, label: "прогресс", hint: "Мой прогресс", icon: PROGRESS_ICON },
  { href: ROUTES.armHelp, label: "справка", hint: "Справка", icon: HELP_ICON },
];

/** Ряд вкладок-иконок под датой в тёмном блоке (p12_Image66); активная — синяя. */
export function ArmNavTabs() {
  return (
    <nav className={styles["operator-panel__tabs"]} aria-label="Разделы АРМ обучающегося">
      {NAV_TABS.map((tab) => {
        const isActive = tab.href === ROUTES.arm;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            title={tab.hint}
            aria-current={isActive ? "page" : undefined}
            className={[styles["operator-panel__tab"], isActive ? styles["operator-panel__tab--active"] : ""]
              .filter(Boolean)
              .join(" ")}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
