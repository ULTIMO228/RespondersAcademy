import type { IncidentMapContext } from "@/entities/incident";
import { getServiceStatusTone, resolveTraineeServiceId } from "@/entities/service";
import type { ReferenceData } from "@/shared/api";

/** Служба обучающегося (User.service) → id ServiceRef, как в карточке (спека 012 FR-007); не найдена — undefined. */
export function resolveMyServiceId(
  reference: ReferenceData,
  service: string | undefined,
): string | undefined {
  return resolveTraineeServiceId(service, reference.services);
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
