import type { Recommendation } from "@/shared/api";
import { AiSourceBadge } from "@/shared/ui";
import { LinkButton, Tag } from "@/shared/ui/platform";

import { describeReason, recommendationHref } from "../lib/links";
import styles from "./RecommendationList.module.css";

type RecommendationListProps = {
  items: Recommendation[];
  /** Вызывается по клику «Изучить» до перехода: принятие рекомендации (аналитика). */
  onOpen?: (recommendation: Recommendation) => void;
};

/** Рекомендации, объяснение и источник; итоговое решение по оценке остаётся за преподавателем (Q&A в3). */
export function RecommendationList({ items, onOpen }: RecommendationListProps) {
  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span>
              <span className={styles.item__title}>
                {item.title} <AiSourceBadge source={item.source} />
              </span>
              <span className={styles.item__reason}>{describeReason(item)}</span>
              {item.text ? <span className={styles.item__explanation}>{item.text}</span> : null}
            </span>
            <span className={styles.item__actions}>
              {item.acceptedAt ? <Tag tone="success">Принята</Tag> : null}
              <LinkButton
                href={recommendationHref(item)}
                variant="secondary"
                aria-label={`Изучить: ${item.title}`}
                onClick={() => onOpen?.(item)}
              >
                Изучить
              </LinkButton>
            </span>
          </li>
        ))}
      </ul>
      <p className={styles.note}>
        Источник текста указан у каждой рекомендации; приоритет итоговой оценки — за преподавателем.
      </p>
    </>
  );
}
