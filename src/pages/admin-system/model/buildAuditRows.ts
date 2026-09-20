import { ROLE_TITLES } from "@/entities/user";
import type { AuditLogEntry, PublicUser } from "@/shared/api";
import { describeAuditAction } from "@/shared/config";
import { formatDate, formatTime } from "@/shared/lib";

import type { AuditRow } from "./types";

const SYSTEM_ACTOR = "Система";
const NO_ROLE = "—";

/** AuditLogEntry → строка таблицы: ФИО/№ АРМ разрешаются по реестру, Дата и Время — раздельно. */
export function buildAuditRows(entries: AuditLogEntry[], users: PublicUser[]): AuditRow[] {
  return entries.map((entry) => {
    const user = users.find((candidate) => candidate.id === entry.userId);
    return {
      id: entry.id,
      cardId: entry.cardId,
      operatorArm: entry.operatorArm ?? user?.armNumber,
      fullName: user?.fullName ?? SYSTEM_ACTOR,
      roleTitle: entry.role ? ROLE_TITLES[entry.role] : NO_ROLE,
      date: formatDate(entry.at),
      time: formatTime(entry.at),
      event: describeAuditAction(entry.action),
      details: entry.details,
    };
  });
}
