import { getLastStatusEvent, getStatusTitle } from "@/entities/service";
import type { ServiceStatusEvent } from "@/entities/service";
import type { ServiceRef, StatusRef } from "@/shared/api";
import { formatHourMinute } from "@/shared/lib";

import { PHONE_ONLY_KIND } from "../config/constants";
import type { ServiceHistory, ServicePanelCard } from "./types";

export type ServiceTileModel = {
  serviceId: string;
  name: string;
  fullName: string;
  statusLine: string;
  isPhoneOnly: boolean;
  isMain: boolean;
  events: ServiceStatusEvent[];
};

type BuildTilesInput = {
  services: ServiceRef[];
  serviceStatuses: StatusRef[];
  history: ServiceHistory;
  order: string[];
  mainServiceIds: string[];
};

/** История статусов служб списка оповещения фикстуры (начальное состояние панели). */
export function toServiceHistory(card: ServicePanelCard): ServiceHistory {
  return Object.fromEntries(card.notificationList.map((entry) => [entry.serviceId, [...entry.statuses]]));
}

/** «11:14 Добавлена» — время и название последнего статуса службы. */
export function formatStatusLine(events: ServiceStatusEvent[], serviceStatuses: StatusRef[]): string {
  const last = getLastStatusEvent(events);
  // Без событий плитка не должна показывать пустую строку — служба ещё не оповещена.
  return last
    ? `${formatHourMinute(last.at)} ${getStatusTitle(last.status, serviceStatuses)}`
    : "не оповещена";
}

/** Плитки панели «Службы:» в порядке списка оповещения. */
export function buildServiceTiles({
  services,
  serviceStatuses,
  history,
  order,
  mainServiceIds,
}: BuildTilesInput) {
  return order.map<ServiceTileModel>((serviceId) => {
    const service = services.find((item) => item.id === serviceId);
    const events = history[serviceId] ?? [];
    return {
      serviceId,
      name: service?.shortName ?? serviceId,
      fullName: service?.name ?? serviceId,
      statusLine: formatStatusLine(events, serviceStatuses),
      isPhoneOnly: service?.kind === PHONE_ONLY_KIND,
      isMain: mainServiceIds.includes(serviceId),
      events,
    };
  });
}
