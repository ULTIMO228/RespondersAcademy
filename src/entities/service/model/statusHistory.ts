/** Событие истории статусов службы (NotificationStatus фикстуры + локальные изменения волны 0). */
export type ServiceStatusEvent = {
  status: string;
  at: string;
  actor: string;
  comment?: string;
  dutyNumber?: string;
};

type StatusTitleRef = { status: string; title: string };

/** Название статуса по справочнику («added» → «Добавлена»); неизвестный код показывается как есть. */
export function getStatusTitle(status: string, statusRefs: StatusTitleRef[]): string {
  return statusRefs.find((ref) => ref.status === status)?.title ?? status;
}

export function getLastStatusEvent(events: ServiceStatusEvent[]): ServiceStatusEvent | undefined {
  return events[events.length - 1];
}
