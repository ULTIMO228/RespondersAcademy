import type { FeedItem, QueueItem, StudentTileModel } from "../model/types";
import { EventFeed } from "./EventFeed";
import { IssueQueue } from "./IssueQueue";
import { StudentTile } from "./StudentTile";

import styles from "./MonitorBoard.module.css";

type MonitorBoardProps = {
  tiles: StudentTileModel[];
  feedItems: FeedItem[];
  queueItems: QueueItem[];
  /** Выдача новых карточек приостановлена преподавателем (T3.2-11). */
  isIssuePaused?: boolean;
};

/**
 * Дашборд класса: сетка плиток + лента событий + очередь выдачи. Все три блока строятся из одной ленты
 * занятия, поэтому расходятся не больше чем на один тик обновления (spec/04-pages/10 «Критерии приёмки»).
 */
export function MonitorBoard({ tiles, feedItems, queueItems, isIssuePaused = false }: MonitorBoardProps) {
  const offlineCount = tiles.filter((tile) => tile.state === "offline").length;
  return (
    <div className={styles.board}>
      <section className={styles.board__tiles} aria-label="Курсанты занятия">
        <div className={styles.board__toolbar}>
          <h2 className={styles.board__title}>Курсанты: {tiles.length}</h2>
          {offlineCount > 0 ? <p className={styles.board__note}>не подключены: {offlineCount}</p> : null}
        </div>
        {tiles.length === 0 ? (
          <p className={styles.board__note}>В занятии нет курсантов — добавьте их в мастере занятия</p>
        ) : null}
        <ul className={styles.board__grid}>
          {tiles.map((tile) => (
            <li key={tile.studentId}>
              <StudentTile tile={tile} />
            </li>
          ))}
        </ul>
      </section>
      <aside className={styles.board__side}>
        <EventFeed items={feedItems} />
        <IssueQueue items={queueItems} isPaused={isIssuePaused} />
      </aside>
    </div>
  );
}
