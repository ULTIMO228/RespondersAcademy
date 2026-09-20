"use client";

import { useState } from "react";

import type { InternalNumber } from "@/shared/api";
import { Button } from "@/shared/ui";

import { NUMBER_GROUPS } from "../config/numberGroups";

import styles from "./InternalNumbers.module.css";

type InternalNumbersProps = {
  numbers: InternalNumber[];
  /** Номера, ожидаемые по текущей карточке (эталон → главная служба → callTarget), см. resolveExpectedCall. */
  expectedNumbers?: readonly string[];
  /** Контекст подсветки: «карточка 36814851». */
  expectedContext?: string;
  onCall: (number: string) => void;
};

function matchesQuery(entry: InternalNumber, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return normalized === "" || `${entry.number} ${entry.title}`.toLowerCase().includes(normalized);
}

/** Вкладка «Контакты»: справочник внутренних номеров учебного контура (стиль page-50 АРМ ЕДДС). */
export function InternalNumbers({
  numbers,
  expectedNumbers = [],
  expectedContext,
  onCall,
}: InternalNumbersProps) {
  const [query, setQuery] = useState("");
  const visibleNumbers = numbers.filter((entry) => matchesQuery(entry, query));
  return (
    <div className={styles.contacts}>
      <input
        className={styles.contacts__search}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти контакт"
        aria-label="Найти контакт"
      />
      {NUMBER_GROUPS.map((group) => {
        const groupNumbers = visibleNumbers.filter((entry) => group.matches(entry.number));
        if (groupNumbers.length === 0) return null;
        return (
          <section key={group.id} className={styles.contacts__group} aria-label={group.title}>
            <h3 className={styles.contacts__heading}>{group.title}</h3>
            <ul className={styles.contacts__list}>
              {groupNumbers.map((entry) => {
                const isExpected = expectedNumbers.includes(entry.number);
                return (
                  <li
                    key={entry.number}
                    className={[
                      styles.contacts__item,
                      isExpected ? styles["contacts__item--expected"] : "",
                    ].join(" ")}
                    data-expected={isExpected || undefined}
                  >
                    <span className={styles.contacts__dot} aria-hidden="true" />
                    <span className={styles.contacts__body}>
                      <span className={styles.contacts__title}>{entry.title}</span>
                      <span className={styles.contacts__phone}>
                        Тел.: <b>{entry.number}</b>
                      </span>
                      {isExpected ? (
                        <span className={styles.contacts__expected}>
                          Ожидается по эталону{expectedContext ? ` (${expectedContext})` : ""}
                        </span>
                      ) : null}
                    </span>
                    <Button
                      size="sm"
                      className={styles.contacts__call}
                      onClick={() => onCall(entry.number)}
                      title={`Вызов ${entry.number}`}
                    >
                      Вызов
                    </Button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {visibleNumbers.length === 0 ? <p className={styles.contacts__empty}>Контакты не найдены</p> : null}
    </div>
  );
}
