"use client";

import { useEffect, useRef } from "react";

import { PlatformButton } from "@/shared/ui/platform";

import styles from "./ConstructorScreen.module.css";

const KEYS: [string, string][] = [
  ["F6 / Shift + F6", "Перейти между областями: панель действий → блоки → схема → свойства → проверка"],
  ["Tab / Shift + Tab", "Следующий / предыдущий элемент внутри области"],
  ["↓ ↑", "На схеме — следующий шаг по первому выходу / предыдущий шаг"],
  ["← →", "На схеме — соседний по номеру шаг"],
  ["Ctrl + стрелки", "Передвинуть выбранный блок (с Shift — крупным шагом)"],
  ["Enter", "В библиотеке — добавить блок после выбранного; на схеме — открыть свойства"],
  ["Delete", "Удалить выбранный блок или связь (можно вернуть)"],
  ["Esc", "Снять выделение"],
  ["Ctrl + Z / Ctrl + Shift + Z", "Отменить / повторить (до 50 шагов)"],
  ["Ctrl + S", "Сохранить (в прототипе — в этом браузере)"],
  ["Ctrl + колесо мыши", "Масштаб; колесо — прокрутка поля, Shift + колесо — вбок"],
];

/** Окно «Клавиши» (design-concept.md §12, эскиз «состояния», кадр 7). */
export function KeysDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => previous?.focus?.();
  }, []);
  return (
    <div className={styles.backdrop} onPointerDown={onClose}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="flow-keys-title"
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
        }}
      >
        <h2 id="flow-keys-title" className={styles.dialog__title}>
          Клавиши
        </h2>
        <dl className={styles.keys}>
          {KEYS.map(([keys, text]) => (
            <div key={keys} className={styles.keys__row}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <div className={styles.dialog__actions}>
          <PlatformButton variant="primary" className={styles.button} onClick={onClose}>
            Понятно
          </PlatformButton>
        </div>
      </div>
    </div>
  );
}
