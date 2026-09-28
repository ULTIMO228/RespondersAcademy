import type { LiveSessionState, MonitorStudent, SnapshotAction } from "@/widgets/monitor-grid";
import type { MonitorReference, StudentStateView } from "@/widgets/monitor-grid";
import type { TimeNormsMs } from "@/entities/session";
import type { CardEventContract, SessionContract } from "@/shared/api";

import type { MirrorCard } from "../api/loadMirrorCard";
import type { MonitorAccess } from "../lib/resolveAccess";

export type { MonitorAccess };

/** Кадр экрана курсанта: доступ, зеркало карточки, попытка и её действия, справочники. */
export type StudentMonitorView = {
  access: MonitorAccess;
  state: LiveSessionState;
  session: SessionContract | null;
  student: MonitorStudent | null;
  /** Текущее состояние курсанта (карточка, таймеры, статус) из ленты. */
  current: StudentStateView | null;
  attempt: CardEventContract | null;
  actions: SnapshotAction[];
  mirror: MirrorCard | null;
  reference: MonitorReference;
  isOnline: boolean;
  norms: TimeNormsMs | null;
  reload?: () => void;
};
