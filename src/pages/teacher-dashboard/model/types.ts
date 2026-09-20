import type { FeedItem, LiveSessionState, QueueItem, SessionHeaderModel } from "@/widgets/monitor-grid";
import type { MonitorStudent, StudentTileModel } from "@/widgets/monitor-grid";
import type { SessionContract } from "@/shared/api";

/** Готовый кадр дашборда: всё построено из одной ленты занятия и одного «сейчас». */
export type BoardView = {
  session: SessionContract;
  header: SessionHeaderModel;
  tiles: StudentTileModel[];
  /** Курсанты занятия (GET /users) — выбор получателя внеочередной карточки. */
  students: MonitorStudent[];
  feedItems: FeedItem[];
  queueItems: QueueItem[];
  /** Связь с мок-слоем есть; false — показываем баннер, данные сохраняются. */
  isOnline: boolean;
  isIssuePaused: boolean;
};

export type DashboardView = {
  state: LiveSessionState;
  /** Перечитать занятие (после завершения и после новых событий ленты). */
  reload: () => void;
  board: BoardView | null;
};
