"use client";

import type { Journal112Row } from "@/shared/api";

import { CardsTable } from "./CardsTable";

import styles from "./CardLinks.module.css";

type MatchWindowProps = {
  /** Найденные карточки с тем же заявителем (ответ GET …/matches); пустой список — окно не показывается. */
  matches: readonly Journal112Row[];
  /** «привязать»: экран шлёт linkAdded {cardId} и закрывает окно. */
  onLink: (cardId: string) => void;
  /** «закрыть и продолжить заполнение новой»: окно закрывается, заполненные поля карточки не теряются. */
  onContinue: () => void;
};

/**
 * Окно «Есть карточка с заявителем по этому номеру:» (ИНСТРУКЦИЯ_image62; спека 009, FR-024): малиновые полосы поверх
 * карточки, посередине — найденная карточка в колонках журнала с кнопкой «привязать».
 */
export function MatchWindow({ matches, onLink, onContinue }: MatchWindowProps) {
  if (matches.length === 0) return null;
  return (
    <div className={styles.match__overlay}>
      <section className={styles.match} role="dialog" aria-modal="true" aria-labelledby="match-title">
        <h2 id="match-title" className={styles.match__title}>
          Есть карточка с заявителем по этому номеру:
        </h2>
        <div className={styles.match__body}>
          <CardsTable
            label="Найденные карточки"
            rows={matches.map((row) => ({
              row,
              actions: (
                <button
                  type="button"
                  className={styles.outlined}
                  aria-label={`привязать карточку ${row.number}`}
                  onClick={() => onLink(row.cardId)}
                >
                  привязать
                </button>
              ),
            }))}
          />
        </div>
        <div className={styles.match__footer}>
          <button type="button" className={styles.outlined} onClick={onContinue}>
            закрыть и продолжить заполнение новой
          </button>
        </div>
      </section>
    </div>
  );
}
