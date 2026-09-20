import type { ArmCardFixtureContract, NotificationEntryContract } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { formatDateTime } from "@/shared/lib";
import type { StatusTone } from "@/shared/ui";

import { formatListAddress, parseRegisteredBy, pickCodeFromServiceIds, splitDescription } from "./parse";
import type { IncidentListItem, IncidentPreviewStatus, IncidentServiceStatus } from "./types";

/** Справочники, нужные для проекции (ReferenceData из GET /api/mock/reference — собирает вызывающий). */
export type IncidentMapContext = {
  serviceNames: Record<string, string>;
  serviceStatusTitles: Record<string, string>;
  cardStatusTitles: Record<string, string>;
  getStatusTone: (statusCode: string) => StatusTone;
  /** Служба обучающегося: её статус показывается в колонке «Статус службы». */
  myServiceId?: string;
};

const RECENT_STATUSES_LIMIT = 5;
const NO_VICTIMS = "Нет";
const ONE_VICTIM = "1";
/** Пустая ячейка списка (например, АРМ у карточки из ВИС) — не undefined и не пустая строка. */
export const EMPTY_CELL = "—";

export function toServiceStatus(statusCode: string, context: IncidentMapContext): IncidentServiceStatus {
  return {
    code: statusCode,
    title: context.serviceStatusTitles[statusCode] ?? statusCode,
    tone: context.getStatusTone(statusCode),
  };
}

function pickMyEntry(
  entries: NotificationEntryContract[],
  myServiceId?: string,
): NotificationEntryContract | undefined {
  return entries.find((entry) => entry.serviceId === myServiceId) ?? entries[0];
}

function lastStatusCode(entry: NotificationEntryContract | undefined): string {
  return entry?.statuses.at(-1)?.status ?? "added";
}

function collectRecentStatuses(
  fixture: ArmCardFixtureContract,
  context: IncidentMapContext,
): IncidentPreviewStatus[] {
  const events = fixture.notificationList.flatMap((entry) =>
    entry.statuses.map((status) => ({
      at: status.at,
      actor: status.actor,
      serviceName: context.serviceNames[entry.serviceId] ?? entry.serviceId,
      statusTitle: context.serviceStatusTitles[status.status] ?? status.status,
      comment: status.comment ?? "",
    })),
  );
  return events
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, RECENT_STATUSES_LIMIT)
    .map((event) => ({ ...event, at: formatDateTime(event.at) }));
}

function pickEmergencyMark(fixture: ArmCardFixtureContract): string | null {
  if (fixture.emergency.chs) return "ЧС";
  if (fixture.emergency.chp) return "ЧП";
  return null;
}

/**
 * Карточка списка GET /api/mock/cards (фикстура ПОВ-112 или проекция учебной) → строка ленты
 * «Список происшествий»: 11 колонок + флаги СМС/ЧС и сводка предпросмотра. Лишние поля фикстуры не переносятся.
 */
export function mapArmFixture(
  fixture: ArmCardFixtureContract,
  context: IncidentMapContext,
): IncidentListItem {
  const registeredBy = parseRegisteredBy(fixture.registeredBy);
  const serviceIds = fixture.notificationList.map((entry) => entry.serviceId);
  return {
    id: fixture.id,
    href: ROUTES.armCard(fixture.id),
    number: fixture.number,
    createdAt: fixture.createdAt,
    operatorNumber: registeredBy.operatorNumber,
    armNumber: registeredBy.armNumber || EMPTY_CELL,
    typeName: fixture.what.finalType,
    typeCode: pickCodeFromServiceIds(serviceIds, fixture.what.classifierCode ?? EMPTY_CELL),
    victims: fixture.what.casualties.injured ? ONE_VICTIM : NO_VICTIMS,
    address: formatListAddress(fixture.address.formal),
    serviceStatus: toServiceStatus(
      lastStatusCode(pickMyEntry(fixture.notificationList, context.myServiceId)),
      context,
    ),
    emergencyMark: pickEmergencyMark(fixture),
    smsCount: fixture.smsList?.length ?? 0,
    description: splitDescription(fixture.description),
    links: [],
    isImportant: false,
    isEmpty: false,
    state: "normal",
    issuedAt: null,
    reactionTimer: null,
    preview: {
      applicant: [fixture.applicant.name, fixture.applicant.status].filter(Boolean).join(", "),
      phone: fixture.phones.aon,
      cardStatus: context.cardStatusTitles[fixture.cardStatus] ?? fixture.cardStatus,
      services: fixture.notificationList.map((entry) => ({
        name: context.serviceNames[entry.serviceId] ?? entry.serviceId,
        status: toServiceStatus(lastStatusCode(entry), context),
      })),
      recentStatuses: collectRecentStatuses(fixture, context),
    },
  };
}
