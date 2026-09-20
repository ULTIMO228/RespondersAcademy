import type { ServiceStatusEvent } from "@/entities/service";
import type { ServiceHistory } from "@/widgets/service-panel";
import type { CardStatusMark, NotificationEntryContract } from "@/shared/api";

import { SERVICE_ADDED, SERVICE_RECEIVED, TRAINEE_ACTOR } from "../model/constants";

type HistoryInput = {
  notificationList: { serviceId: string; statuses: NotificationEntryContract["statuses"] }[];
  myServiceId: string | undefined;
  /** CardEvent.openedAt — автоматическая «Получена службой» (памятка стр. 21). */
  openedAt: string;
  /** Статусы ДДС попытки (CardEvent.statuses) — в таймлайн моей службы. */
  marks: CardStatusMark[];
};

function toServiceEvent(mark: CardStatusMark): ServiceStatusEvent {
  const { ddsStatus, at, comment, dutyNumber } = mark;
  return { status: ddsStatus, at, actor: TRAINEE_ACTOR, comment, dutyNumber };
}

/**
 * История статусов служб для тренажёра (T2.3-01/T2.3-12): у «моей службы» из фикстуры остаётся только
 * «Добавлена» (карточка отрабатывается заново), далее — «Получена службой» в момент открытия и статусы ДДС
 * попытки. Остальные службы — как в фикстуре.
 */
export function buildTraineeHistory({
  notificationList,
  myServiceId,
  openedAt,
  marks,
}: HistoryInput): ServiceHistory {
  return Object.fromEntries(
    notificationList.map((entry) => {
      if (entry.serviceId !== myServiceId) return [entry.serviceId, [...entry.statuses]];
      const added = entry.statuses.filter((event) => event.status === SERVICE_ADDED);
      const received: ServiceStatusEvent = { status: SERVICE_RECEIVED, at: openedAt, actor: TRAINEE_ACTOR };
      return [entry.serviceId, [...added, received, ...marks.map(toServiceEvent)]];
    }),
  );
}
