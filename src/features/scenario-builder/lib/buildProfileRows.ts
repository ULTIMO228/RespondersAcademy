import type { ProfileMappingRow, ServiceRef } from "@/shared/api";

import type { ProfileRowView } from "../model/types";

/** Строки таблицы привязки: данные мок-слоя + человекочитаемые названия служб-получателей. */
export function buildProfileRows(
  rows: readonly ProfileMappingRow[],
  services: readonly ServiceRef[],
): ProfileRowView[] {
  return rows.map((row) => ({
    id: row.id,
    profile: row.profile,
    groupName: row.groupName,
    studentCount: row.studentCount,
    incidentGroups: row.incidentGroups,
    serviceNames: row.serviceIds.map(
      (serviceId) => services.find((service) => service.id === serviceId)?.shortName ?? serviceId,
    ),
  }));
}
