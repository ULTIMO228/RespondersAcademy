"use client";

import { useState } from "react";

import type { NotificationListItem } from "@/shared/api";
import { Modal } from "@/shared/ui";

import { serviceOptions } from "../model/services";

import styles from "./Operator112ServicesBar.module.css";

type AddServicesWindowProps = {
  services: readonly NotificationListItem[];
  conditional: readonly NotificationListItem[];
  onSave: (serviceIds: string[]) => void;
  onClose: () => void;
};

const EMPTY_NOTE = "Выберите признаки в опросной карте — список служб рассчитает сервер";

/**
 * Окно «Добавьте службы» (КАРТОЧКА_image3; FR-020): поиск, выбранные службы синие, «Сохранить и закрыть» добавляет
 * отмеченные, «×» и Esc закрывают без изменений. Службы списка оповещения по ЕКП снять нельзя (FR-019).
 */
export function AddServicesWindow({ services, conditional, onSave, onClose }: AddServicesWindowProps) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const options = serviceOptions(services, conditional, query);
  const hasAny = services.length > 0 || conditional.length > 0;

  const toggle = (serviceId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });

  return (
    <Modal
      title="Добавьте службы"
      onClose={onClose}
      footer={
        <button type="button" className={styles.window__save} onClick={() => onSave(Array.from(picked))}>
          Сохранить и закрыть
        </button>
      }
    >
      <input
        className={styles.window__search}
        value={query}
        placeholder="Поиск ..."
        aria-label="Поиск службы"
        onChange={(event) => setQuery(event.target.value)}
      />
      {hasAny ? (
        <ul className={styles.window__list} aria-label="Службы">
          {options.map((option) => {
            const isSelected = option.isListed || picked.has(option.serviceId);
            return (
              <li key={option.serviceId}>
                <button
                  type="button"
                  className={styles.window__option}
                  aria-pressed={isSelected}
                  data-selected={isSelected}
                  disabled={option.isListed}
                  onClick={() => toggle(option.serviceId)}
                >
                  {option.title}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.window__empty}>{EMPTY_NOTE}</p>
      )}
    </Modal>
  );
}
