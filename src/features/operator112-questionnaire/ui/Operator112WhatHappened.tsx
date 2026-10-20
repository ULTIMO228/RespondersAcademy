"use client";

import { useId, useState } from "react";
import type { KeyboardEvent } from "react";

import type { ClassifierEntry } from "@/shared/api";
import { Chip, Glyph } from "@/shared/ui";

import { matchGroups, QUICK_TYPES, SUGGEST_LIMIT } from "../model/quickTypes";
import type { QuickType } from "../model/quickTypes";
import { resolveEntry, visibleLevels } from "../model/tree";
import type { QuestionnaireState } from "../model/useQuestionnaire";

import styles from "./Operator112WhatHappened.module.css";

type Operator112WhatHappenedProps = {
  questionnaire: QuestionnaireState;
  entries: readonly ClassifierEntry[];
  /** Пока вызов не принят или карточка сохраняется, выбор недоступен. */
  disabled?: boolean;
};

/**
 * Тип происшествия карточки ПОВ-112: «Введите тип происшествия — что случилось?» с подсказками групп ЕКП, быстрые типы,
 * затем вкладка типа с опросной картой чипами по признакам (КАРТОЧКА_image1–2; спека 009, FR-016, FR-017).
 */
export function Operator112WhatHappened({
  questionnaire: q,
  entries,
  disabled = false,
}: Operator112WhatHappenedProps) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [isOpen, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const groups = isOpen ? matchGroups(entries, query).slice(0, SUGGEST_LIMIT) : [];
  const group = q.selection.group;
  const levels = visibleLevels(entries, q.selection);
  const entry = resolveEntry(entries, q.selection);

  const choose = (next: string) => {
    q.chooseGroup(next);
    setQuery("");
    setOpen(false);
    setActive(-1);
  };

  const pickQuick = (type: QuickType) => {
    const found = type.query ? matchGroups(entries, type.query) : [];
    if (found.length === 1) {
      choose(found[0]);
      return;
    }
    setQuery(type.query ?? "");
    setOpen(true);
    setActive(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" && groups.length) {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, groups.length - 1));
    } else if (event.key === "ArrowUp" && groups.length) {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && groups.length) {
      event.preventDefault();
      choose(groups[Math.max(active, 0)]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      <section className={styles.search} aria-label="Тип происшествия" data-has-type={Boolean(group)}>
        {group ? null : (
          <label className={styles.search__label} htmlFor={inputId}>
            Введите тип происшествия
          </label>
        )}
        <div className={styles.search__field}>
          <input
            id={inputId}
            className={styles.search__input}
            value={query}
            placeholder={group ? "добавить тип происшествия" : "что случилось?"}
            aria-label={group ? "добавить тип происшествия" : undefined}
            role="combobox"
            aria-expanded={groups.length > 0}
            aria-autocomplete="list"
            aria-controls={listId}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={onKeyDown}
          />
          {groups.length ? (
            <ul id={listId} className={styles.search__suggest} role="listbox" aria-label="Типы происшествий">
              {groups.map((name, index) => (
                <li key={name} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={styles.search__option}
                    data-active={index === active}
                    // mousedown, а не click: blur поля закрыл бы список раньше клика.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(name);
                    }}
                  >
                    {name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {isOpen && query.trim() && groups.length === 0 ? (
            <p className={styles.search__empty}>Тип не найден в классификаторе</p>
          ) : null}
        </div>
        {group ? null : (
          <>
            <div className={styles.search__quick} role="group" aria-label="Быстрые типы">
              {QUICK_TYPES.map((type) => {
                const isKnown = Boolean(type.query && matchGroups(entries, type.query).length);
                return (
                  <button
                    key={type.label}
                    type="button"
                    className={styles.search__quickbtn}
                    disabled={disabled || !isKnown}
                    onClick={() => pickQuick(type)}
                  >
                    {type.label}
                  </button>
                );
              })}
            </div>
            <p className={styles.search__significant}>Значимые типы происшествий:</p>
          </>
        )}
        {q.notice ? (
          <p className={styles.search__notice} role="alert">
            {q.notice}
          </p>
        ) : null}
      </section>

      {group ? (
        <section className={styles.type} aria-label="Опросная карта">
          <div className={styles.type__tabs} role="tablist">
            <span className={styles.type__tab} role="tab" aria-selected="true">
              {group}
              <button
                type="button"
                className={styles.type__close}
                aria-label={`Удалить тип «${group}»`}
                disabled={disabled}
                onClick={() => choose("")}
              >
                <Glyph name="close" size={14} />
              </button>
            </span>
          </div>
          <div className={styles.type__panel} role="tabpanel">
            <div className={styles.type__head} data-testid="final-type">
              {entry?.finalType ?? ""}
            </div>
            {levels.map((level) => (
              <div key={level.level} className={styles.type__row} role="group" aria-label={level.title}>
                <span className={styles.type__question}>{level.title}</span>
                <div className={styles.type__options}>
                  {level.options.map((option) => (
                    <Chip
                      key={option}
                      selected={level.selected === option}
                      disabled={disabled}
                      onClick={() => q.chooseSign(level.level, option)}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
