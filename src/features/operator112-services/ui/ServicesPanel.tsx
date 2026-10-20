"use client";

import { useState } from "react";

import type { NotificationListItem } from "@/shared/api";
import { Glyph } from "@/shared/ui";
import type { GlyphName } from "@/shared/ui";

import { tileTitle, uniqueServices } from "../model/services";
import { AddServicesWindow } from "./AddServicesWindow";

import styles from "./ServicesPanel.module.css";

type ServicesPanelProps = {
  /** Список оповещения сервера (автоматические и добавленные вручную службы). */
  services: readonly NotificationListItem[];
  /** Условные службы, которые можно добавить вручную («Добавьте службы»). */
  conditional?: readonly NotificationListItem[];
  /** Состояние расчёта списка оповещения на сервере. */
  status?: "idle" | "loading" | "error";
  errorMessage?: string;
  onRetry?: () => void;
  /** Карточка сохранена и открыта на просмотр: серая панель, без «+», «сохранить» и «×» (ИНСТРУКЦИЯ_image94). */
  saved?: boolean;
  /** Строка под названием плитки у сохранённой карточки, например «13:15 Принята». */
  statusLines?: Readonly<Record<string, string>>;
  disabled?: boolean;
  isSaving?: boolean;
  /** «×» на плитке ручной службы: экран шлёт событие serviceRemoved и пересчитывает список. */
  onRemove: (serviceId: string) => void;
  /** «Сохранить и закрыть» в окне «Добавьте службы». */
  onAddServices: (serviceIds: string[]) => void;
  onSave: () => void;
  /** Значки справа; без обработчика значок неактивен (aria-disabled). */
  onLinks?: () => void;
  /** Карточка связана: значок связей показывается как «связана» (ИНСТРУКЦИЯ_64). */
  isLinked?: boolean;
  onReminder?: () => void;
  onProblem?: () => void;
  onClose?: () => void;
};

type ActionKey = "links" | "reminder" | "hand" | "bell" | "problem" | "close";

const ACTIONS: { key: ActionKey; glyph: GlyphName; title: string }[] = [
  { key: "links", glyph: "link", title: "Связи" },
  { key: "reminder", glyph: "timer", title: "Напоминание" },
  { key: "hand", glyph: "hand", title: "Внимание" },
  { key: "bell", glyph: "bell", title: "Оповещение" },
  { key: "problem", glyph: "feedback", title: "Сообщить о проблеме" },
  { key: "close", glyph: "close", title: "Закрыть карточку" },
];

const LOCKED_TILE = "Служба из списка оповещения по ЕКП — удалить нельзя";

/**
 * Панель «Службы:» карточки ПОВ-112 (КАРТОЧКА_image1, 3; спека 009, FR-018…FR-021): плитки списка оповещения
 * (первая подчёркнута; автоматические не удаляются, ручные — «×»), «⇕» разворачивает панель, «+» открывает «Добавьте
 * службы», «сохранить» передаёт карточку. Цвет — по состоянию карточки: оранжевая при заполнении, серая у сохранённой.
 */
export function ServicesPanel({
  services,
  conditional = [],
  status = "idle",
  errorMessage,
  onRetry,
  saved = false,
  statusLines,
  disabled = false,
  isSaving = false,
  onRemove,
  onAddServices,
  onSave,
  onLinks,
  isLinked = false,
  onReminder,
  onProblem,
  onClose,
}: ServicesPanelProps) {
  const [isExpanded, setExpanded] = useState(false);
  const [isAdding, setAdding] = useState(false);
  const tiles = uniqueServices(services);
  const handlers: Partial<Record<ActionKey, (() => void) | undefined>> = {
    links: onLinks,
    reminder: onReminder,
    problem: onProblem,
    close: onClose,
  };

  return (
    <footer className={styles.bar} aria-label="Службы" data-expanded={isExpanded} data-saved={saved}>
      <span className={styles.bar__label}>Службы:</span>
      {tiles.length ? (
        <ul className={styles.bar__tiles} aria-label="Список оповещения">
          {tiles.map((item, index) => {
            const isManual = item.addedBy === "manual";
            return (
              <li
                key={item.serviceId}
                className={styles.tile}
                data-first={index === 0}
                data-added-by={item.addedBy}
                title={item.condition ? `${item.title} — ${item.condition}` : item.title}
              >
                <span className={styles.tile__head}>
                  <Glyph name="phone" size={14} />
                  {saved ? null : isManual ? (
                    <button
                      type="button"
                      className={styles.tile__remove}
                      aria-label={`Удалить службу ${item.title}`}
                      disabled={disabled}
                      onClick={() => onRemove(item.serviceId)}
                    >
                      <Glyph name="close" size={12} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={styles.tile__remove}
                      aria-label={`Удалить службу ${item.title}`}
                      aria-disabled="true"
                      title={LOCKED_TILE}
                    >
                      <Glyph name="close" size={12} />
                    </button>
                  )}
                </span>
                <span className={styles.tile__name}>{tileTitle(item.title)}</span>
                {saved && statusLines?.[item.serviceId] ? (
                  <span className={styles.tile__status}>{statusLines[item.serviceId]}</span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {status === "loading" ? (
        <span className={styles.bar__status} role="status">
          Расчёт списка оповещения…
        </span>
      ) : null}
      {status === "error" ? (
        <span className={styles.bar__status} role="alert">
          {errorMessage ?? "Не удалось получить список оповещения"}{" "}
          {onRetry ? (
            <button type="button" className={styles.bar__retry} onClick={onRetry}>
              Повторить
            </button>
          ) : null}
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
      {saved ? null : (
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
      )}
      <div className={styles.bar__actions}>
        {saved ? null : (
          <button type="button" className={styles.bar__save} disabled={disabled || isSaving} onClick={onSave}>
            {isSaving ? "сохранение…" : "сохранить"}
          </button>
        )}
        {ACTIONS.map((action) => {
          const handler = handlers[action.key];
          const linked = action.key === "links" && isLinked;
          return (
            <button
              key={action.key}
              type="button"
              className={[styles.bar__square, linked ? styles["bar__square--linked"] : ""].join(" ")}
              aria-label={linked ? "связана" : action.title}
              title={linked ? "Показ связей" : action.title}
              aria-disabled={handler ? undefined : "true"}
              onClick={handler}
            >
              <Glyph name={action.glyph} size={linked ? 20 : 24} />
              {linked ? <span className={styles.bar__caption}>связана</span> : null}
            </button>
          );
        })}
      </div>
      {isAdding ? (
        <AddServicesWindow
          services={services}
          conditional={conditional}
          onSave={(ids) => {
            setAdding(false);
            if (ids.length) onAddServices(ids);
          }}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </footer>
  );
}
