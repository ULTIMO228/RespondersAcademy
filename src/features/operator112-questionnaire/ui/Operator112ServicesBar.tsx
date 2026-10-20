"use client";

import { useState } from "react";

import { Glyph } from "@/shared/ui";
import type { GlyphName } from "@/shared/ui";

import { tileTitle, uniqueServices } from "../model/services";
import type { QuestionnaireState } from "../model/useQuestionnaire";
import { AddServicesWindow } from "./AddServicesWindow";

import styles from "./Operator112ServicesBar.module.css";

type Operator112ServicesBarProps = {
  questionnaire: QuestionnaireState;
  disabled?: boolean;
  isSaving?: boolean;
  onSave: () => void;
};

/** Значки справа от «сохранить»: связи, напоминание, «рука», колокол, сообщение, закрыть — в заданиях 112 не используются. */
const IDLE_ACTIONS: { glyph: GlyphName; title: string }[] = [
  { glyph: "link", title: "Связи" },
  { glyph: "timer", title: "Напоминание" },
  { glyph: "hand", title: "Внимание" },
  { glyph: "bell", title: "Оповещение" },
  { glyph: "feedback", title: "Сообщить о проблеме" },
  { glyph: "close", title: "Закрыть карточку" },
];

const LOCKED_TILE = "Служба из списка оповещения по ЕКП — удалить нельзя";

/**
 * Оранжевая панель «Службы:» карточки ПОВ-112 (КАРТОЧКА_image1, 3; спека 009, FR-018…FR-021): плитки списка оповещения,
 * «⇕» разворачивает панель, «+» открывает «Добавьте службы», «сохранить» — передача карточки.
 */
export function Operator112ServicesBar({
  questionnaire: q,
  disabled = false,
  isSaving = false,
  onSave,
}: Operator112ServicesBarProps) {
  const [isExpanded, setExpanded] = useState(false);
  const [isAdding, setAdding] = useState(false);
  const list = q.listState.status === "ready" ? q.listState.list : null;
  const tiles = list ? uniqueServices(list.services) : [];

  return (
    <footer className={styles.bar} aria-label="Службы" data-expanded={isExpanded}>
      <span className={styles.bar__label}>Службы:</span>
      {tiles.length ? (
        <ul className={styles.bar__tiles} aria-label="Список оповещения">
          {tiles.map((item, index) => (
            <li
              key={item.serviceId}
              className={styles.tile}
              data-first={index === 0}
              data-added-by={item.addedBy}
              title={item.condition ? `${item.title} — ${item.condition}` : item.title}
            >
              <span className={styles.tile__head}>
                <Glyph name="phone" size={14} />
                <button
                  type="button"
                  className={styles.tile__remove}
                  aria-label={`Удалить службу ${item.title}`}
                  title={LOCKED_TILE}
                  disabled
                >
                  <Glyph name="close" size={12} />
                </button>
              </span>
              <span className={styles.tile__name}>{tileTitle(item.title)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {q.listState.status === "loading" ? (
        <span className={styles.bar__status} role="status">
          Расчёт списка оповещения…
        </span>
      ) : null}
      {q.listState.status === "error" ? (
        <span className={styles.bar__status} role="alert">
          {q.listState.message}{" "}
          <button type="button" className={styles.bar__retry} onClick={() => void q.retry()}>
            Повторить
          </button>
        </span>
      ) : null}
      {tiles.length ? (
        <button
          type="button"
          className={styles.bar__square}
          aria-label={isExpanded ? "Свернуть список служб" : "Развернуть список служб"}
          aria-expanded={isExpanded}
          onClick={() => setExpanded((value) => !value)}
        >
          <Glyph name="unfold" size={22} />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.bar__square}
        aria-label="Добавить службы"
        title="Добавить службы"
        disabled={disabled}
        onClick={() => setAdding(true)}
      >
        <Glyph name="plus" size={26} />
      </button>
      <div className={styles.bar__actions}>
        <button type="button" className={styles.bar__save} disabled={disabled || isSaving} onClick={onSave}>
          {isSaving ? "сохранение…" : "сохранить"}
        </button>
        {IDLE_ACTIONS.map((action) => (
          <button
            key={action.glyph}
            type="button"
            className={styles.bar__square}
            aria-label={action.title}
            title={action.title}
            disabled
          >
            <Glyph name={action.glyph} size={24} />
          </button>
        ))}
      </div>
      {isAdding ? (
        <AddServicesWindow
          services={list?.services ?? []}
          conditional={list?.conditional ?? []}
          onSave={(ids) => {
            setAdding(false);
            void q.addServices(ids);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </footer>
  );
}
