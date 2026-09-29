import type { Recommendation } from "@/shared/api";
import { LinkButton, Tag } from "@/shared/ui/platform";

import { describeReason, recommendationHref } from "../lib/links";
import styles from "./RecommendationList.module.css";

type RecommendationListProps = {
  items: Recommendation[];
  /** Вызывается по клику «Изучить» до перехода: принятие рекомендации (аналитика). */
  onOpen?: (recommendation: Recommendation) => void;
};

/**
 * Рекомендации ИИ: название, причина, принятие. Пометка о приоритете преподавателя обязательна (Q&A в3): содержимое
 * подготовлено ИИ-модулем, итоговое решение — за преподавателем.
 */
export function RecommendationList({ items, onOpen }: RecommendationListProps) {
  return (
    <>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.id} className={styles.item}>
            <span>
              {item.title}
              <span className={styles.item__reason}>{describeReason(item)}</span>
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
        Рекомендации подготовлены ИИ; приоритет итоговой оценки — за преподавателем.
      </p>
    </>
  );
}
