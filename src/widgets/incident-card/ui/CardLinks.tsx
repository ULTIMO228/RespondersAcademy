import Link from "next/link";

import { ROUTES } from "@/shared/config";

import type { LinkedCard } from "../model/types";

import styles from "./CardLinks.module.css";

type CardLinksProps = {
  linkedCards: LinkedCard[];
  /** Режим просмотра преподавателя: без переходов. */
  readOnly?: boolean;
};

/**
 * Блок «Связи» (spec п. 10): цепочка связанных карточек с ролями «главная» / «подчинённая».
 * В тренажёре связи read-only — без «Совпадение» / отвязки; переход обычным кликом.
 */
export function CardLinks({ linkedCards, readOnly = false }: CardLinksProps) {
  return (
    <section className={styles.links} aria-label="Связи">
      <span className={styles.links__label}>Связи:</span>
      {linkedCards.length === 0 ? (
        <span className={styles.links__empty}>нет</span>
      ) : (
        <ul className={styles.links__list}>
          {linkedCards.map((linked) => (
            <li key={linked.id} className={styles.links__item}>
              <span className={styles.links__role}>{linked.role}</span>
              {readOnly ? (
                <strong>Происшествие {linked.number}</strong>
              ) : (
                <Link href={ROUTES.armCard(linked.id)} className={styles.links__link}>
                  Происшествие {linked.number}
                </Link>
              )}
              <span className={styles.links__type}>{linked.finalType}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
