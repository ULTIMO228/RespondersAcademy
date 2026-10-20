"use client";

import { useState } from "react";

import { ArmIcon, Glyph } from "@/shared/ui";
import type { GlyphName } from "@/shared/ui";

import { formatClock, formatHeaderDate } from "./format";
import styles from "./Journal112Header.module.css";

const MENU = [
  "журнал",
  "экран",
  "статистика",
  "УЕР",
  "вики",
  "заявители",
  "техника",
  "аудит",
  "отчёты",
] as const;

/** Значки над пунктами меню разделов (ИНСТРУКЦИЯ_106). */
const MENU_GLYPHS: Record<(typeof MENU)[number], GlyphName> = {
  журнал: "menu",
  экран: "launch",
  статистика: "barChart",
  УЕР: "settings",
  вики: "help",
  заявители: "people",
  техника: "vehicle",
  аудит: "eye",
  отчёты: "doc",
};

type Props = {
  operatorName: string;
  nowMs: number;
  onCreateCard: () => void;
  onLogout?: () => void;
  /** Меню «справка» (ИНСТРУКЦИЯ_103): «Краткая инструкция» и «Сообщить о проблеме». */
  onShortGuide?: () => void;
  onProblem?: () => void;
};

/** Шапка журнала ученика-112: поиск, дата, оператор, часы, «создать новую карточку», меню (FR-004). */
export function Journal112Header({
  operatorName,
  nowMs,
  onCreateCard,
  onLogout,
  onShortGuide,
  onProblem,
}: Props) {
  const clock = formatClock(nowMs);
  const [isHelpOpen, setHelpOpen] = useState(false);
  const hasHelp = Boolean(onShortGuide || onProblem);
  const pick = (action?: () => void) => () => {
    setHelpOpen(false);
    action?.();
  };
  return (
    <header className={styles.header}>
      <section className={styles.search} aria-label="Поиск происшествий">
        <h1 className={styles.title}>Поиск происшествий</h1>
        <div className={styles.field}>
          <input className={styles.input} type="text" aria-label="Строка поиска" readOnly />
          <span className={styles.clear} aria-hidden="true">
            ×
          </span>
          <ArmIcon name="search" size={30} />
        </div>
        <div className={styles.searchRow}>
          <span className={styles.advanced} aria-disabled="true">
            расширенный по параметрам <ArmIcon name="advanced-chevron" size={12} />
          </span>
          <button type="button" className={styles.ghost} aria-disabled="true">
            сбросить
          </button>
          <button type="button" className={styles.ghost} aria-disabled="true">
            новый поиск
          </button>
        </div>
      </section>
      <section className={styles.dark}>
        <div className={styles.top}>
          <div className={styles.who}>
            <div className={styles.date}>{formatHeaderDate(nowMs)}</div>
            <div className={styles.links}>
              <span>, {operatorName}</span>
              <span aria-disabled="true" className={styles.link}>
                <ArmIcon name="top-settings" size={14} /> настроить
              </span>
              <span className={styles.help}>
                <button
                  type="button"
                  className={styles.linkBtn}
                  aria-haspopup="menu"
                  aria-expanded={isHelpOpen}
                  disabled={!hasHelp}
                  onClick={() => setHelpOpen((open) => !open)}
                >
                  <ArmIcon name="top-info" size={14} /> справка
                </button>
                {isHelpOpen ? (
                  <span className={styles.helpMenu} role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.helpItem}
                      disabled={!onShortGuide}
                      onClick={pick(onShortGuide)}
                    >
                      Краткая инструкция
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={styles.helpItem}
                      disabled={!onProblem}
                      onClick={pick(onProblem)}
                    >
                      Сообщить о проблеме
                    </button>
                  </span>
                ) : null}
              </span>
              <button type="button" className={styles.linkBtn} onClick={onLogout} disabled={!onLogout}>
                <ArmIcon name="top-exit" size={14} /> выйти
              </button>
            </div>
          </div>
          <div className={styles.headset} aria-disabled="true">
            <span className={styles.headsetIcon} aria-hidden="true">
              <Glyph name="headset" size={26} />
            </span>
            <span>не подключен</span>
          </div>
          <div className={styles.clock} role="timer" aria-label="Текущее время">
            <span className={styles.hm}>{clock.hm}</span>
            <span className={styles.sec}>:{clock.s}</span>
          </div>
        </div>
        <nav className={styles.menu} aria-label="Разделы АРМ">
          {MENU.map((item) =>
            item === "журнал" ? (
              <span key={item} className={`${styles.menuItem} ${styles.menuActive}`} aria-current="page">
                <Glyph name={MENU_GLYPHS[item]} size={20} />
                {item}
              </span>
            ) : (
              <span key={item} className={styles.menuItem} aria-disabled="true">
                <Glyph name={MENU_GLYPHS[item]} size={20} />
                {item}
              </span>
            ),
          )}
        </nav>
      </section>
      <button type="button" className={styles.create} onClick={onCreateCard}>
        <span className={styles.createInner}>создать новую карточку</span>
      </button>
    </header>
  );
}
