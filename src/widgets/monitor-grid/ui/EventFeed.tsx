import { AiBadge, Panel } from "@/shared/ui";

import type { FeedItem } from "../model/types";

import styles from "./EventFeed.module.css";

type EventFeedProps = {
  items: FeedItem[];
};

/** Лента событий занятия (новые сверху); мок-оценки и отклонения от эталона — с бейджем «ИИ». */
export function EventFeed({ items }: EventFeedProps) {
  return (
    <Panel title="Лента событий занятия" headerTone="dark" className={styles.feed}>
      <ol className={styles.feed__list} aria-live="polite">
        {items.length === 0 ? (
          <li className={styles.feed__item}>
            <span className={styles.feed__text}>Событий пока нет — ждём действий курсантов</span>
          </li>
        ) : null}
        {items.map((item) => (
          <li
            key={item.id}
            className={[styles.feed__item, item.isAlert ? styles["feed__item--alert"] : ""].join(" ")}
            data-kind={item.kind}
          >
            <time className={styles.feed__time}>{item.time}</time>
            <span className={styles.feed__text}>
              {item.isAi ? (
                <AiBadge title="Мок-оценка ИИ-модуля, итоговую оценку ставит преподаватель" />
              ) : null}{" "}
              {item.text}
            </span>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
