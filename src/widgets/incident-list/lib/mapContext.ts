import type { IncidentMapContext } from "@/entities/incident";
import { getServiceStatusTone } from "@/entities/service";
import type { ReferenceData } from "@/shared/api";

/** Служба обучающегося (User.service — полное название) → id ServiceRef; не найдена — undefined. */
export function resolveMyServiceId(
  reference: ReferenceData,
  service: string | undefined,
): string | undefined {
  if (!service) return undefined;
  return reference.services.find((candidate) => candidate.name === service)?.id;
}

/** Справочники для списочной проекции строк (названия служб/статусов, тон маркера, моя служба). */
export function buildMapContext(reference: ReferenceData, service: string | undefined): IncidentMapContext {
  return {
    serviceNames: Object.fromEntries(reference.services.map((item) => [item.id, item.shortName])),
    serviceStatusTitles: Object.fromEntries(
      reference.serviceStatuses.map((item) => [item.status, item.title]),
    ),
    cardStatusTitles: Object.fromEntries(reference.cardStatuses.map((item) => [item.status, item.title])),
    getStatusTone: getServiceStatusTone,
    myServiceId: resolveMyServiceId(reference, service),
  };
}
