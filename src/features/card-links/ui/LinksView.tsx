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
  /** Кнопки меняют связи через экран (linkRemoved / linkPrimary). */
  onUnlink: (cardId: string) => void;
  onMakePrimary: (cardId: string) => void;
  onBack: () => void;
};

/**
 * Режим «Показ связей» (ИНСТРУКЦИЯ_image64…68; спека 009, FR-025): таблица связанных карточек, главная — синяя,
 * у подчинённых «отвязать» и «сделать главной»; малиновая полоса возвращает к карточке.
 */
export function LinksView({ cards, onUnlink, onMakePrimary, onBack }: LinksViewProps) {
  return (
    <section className={styles.links} aria-label="Показ связей">
      <button type="button" className={styles.links__back} onClick={onBack}>
        ← вернуться в карточку · Показ связей: карточек {cards.length}
      </button>
      <div className={styles.links__body}>
        <CardsTable
          label="Связанные карточки"
          rows={cards.map(({ row, primary }) => ({
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
          }))}
        />
      </div>
    </section>
  );
}
