/*
 * GET /api/mock/reference — справочники целиком (11 коллекций ReferenceData).
 * classifierRows — ссылка ($ref), записи классификатора отдаются отдельно: GET /api/mock/classifier.
 * meta файла наружу не отдаётся (не часть контракта).
 */
import type { ReferenceData } from "../types";
import { readReference } from "./readers";

export function getReferenceData(): ReferenceData {
  const reference = readReference();
  return {
    ddsStatuses: reference.ddsStatuses,
    serviceStatuses: reference.serviceStatuses,
    callerStatuses: reference.callerStatuses,
    channels: reference.channels,
    services: reference.services,
    incidentGroups: reference.incidentGroups,
    classifierRows: reference.classifierRows,
    cardStatuses: reference.cardStatuses,
    districts: reference.districts,
    sources: reference.sources,
    internalNumbers: reference.internalNumbers,
  };
}
