"use client";

import type { Journal112Row } from "@/shared/api";

import { CardsTable } from "./CardsTable";

import styles from "./CardLinks.module.css";

export type LinkedCard = {
  row: Journal112Row;
  /** Ровно одна главная, если связи есть. */
  primary: boolean;
};

type LinksViewProps = {
  cards: readonly LinkedCard[];
  /** Текущая (новая) карточка — подчинённая строка в конце таблицы, «отвязать» снимает её связи (ИНСТРУКЦИЯ_65). */
  current?: { row: Journal112Row; onUnlink: () => void };
  /** Кнопки меняют связи через экран (linkRemoved / linkPrimary). */
  onUnlink: (cardId: string) => void;
  onMakePrimary: (cardId: string) => void;
  onBack: () => void;
};

/**
 * Режим «Показ связей» (ИНСТРУКЦИЯ_image64…68; спека 009, FR-025): таблица связанных карточек, главная — синяя,
 * у подчинённых «отвязать» и «сделать главной»; малиновая полоса возвращает к карточке.
 */
export function LinksView({ cards, current, onUnlink, onMakePrimary, onBack }: LinksViewProps) {
  const total = cards.length + (current ? 1 : 0);
  const currentRow = current
    ? [
        {
          row: current.row,
          primary: false,
          actions: (
            <button
              type="button"
              className={styles.outlined}
              aria-label={`отвязать карточку ${current.row.number}`}
              onClick={current.onUnlink}
            >
              отвязать
            </button>
          ),
        },
      ]
    : [];
  return (
    <div className={styles.links__overlay}>
      <section className={styles.links} aria-label="Показ связей">
        <div className={styles.links__body}>
          <CardsTable
            label="Связанные карточки"
            rows={[
              ...cards.map(({ row, primary }) => ({
                row,
                primary,
                actions: primary ? null : (
                  <>
                    <button
                      type="button"
                      className={styles.outlined}
                      aria-label={`отвязать карточку ${row.number}`}
                      onClick={() => onUnlink(row.cardId)}
                    >
                      отвязать
                    </button>
                    <button
                      type="button"
                      className={styles.outlined}
                      aria-label={`сделать главной карточку ${row.number}`}
                      onClick={() => onMakePrimary(row.cardId)}
                    >
                      сделать главной
                    </button>
                  </>
                ),
              })),
              ...currentRow,
            ]}
          />
        </div>
        <div className={styles.links__bar}>
          <button type="button" className={`${styles.outlined} ${styles.links__back}`} onClick={onBack}>
            ← вернуться в карточку
          </button>
          <span className={styles.links__count}>Показ связей: карточек {total}</span>
        </div>
      </section>
    </div>
  );
}
