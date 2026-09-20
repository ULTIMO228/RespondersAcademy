/*
 * Журнал аудита с фильтрами и пагинацией (T4.2-05, экран «аудит» ПОВ-112 — 21-admin-system.md §4).
 * Сид журнала — mocks/admin/audit-log.json (T4.1-01), рантайм-события добавляют все волны через
 * appendAuditEntry. Тип события выводится из кода действия (shared/config/auditEvents).
 */
import { AUDIT_EVENT_TYPES, describeAuditAction, resolveAuditType } from "@/shared/config";

import type { AuditEventType, AuditLogEntry, PageResponse } from "../types";
import { readPageParams, readStringParam } from "./request";
import { validationFailed } from "./respond";
import { listAuditLog, listStoredUsers } from "./store-admin";

/** Совпадение оператора: ФИО, логин или номер АРМ (регистр не важен). */
function matchesOperator(entry: AuditLogEntry, needle: string): boolean {
  const user = listStoredUsers().find((candidate) => candidate.id === entry.userId);
  const fields = [user?.fullName, user?.login, user?.armNumber, entry.operatorArm, entry.userId];
  return fields.some((field) => field !== undefined && String(field).toLowerCase().includes(needle));
}

function matchesText(entry: AuditLogEntry, needle: string): boolean {
  const fields = [describeAuditAction(entry.action), entry.action, entry.details, entry.cardId];
  return fields.some((field) => field !== undefined && field.toLowerCase().includes(needle));
}

function parseDate(raw: string | undefined, key: string): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw validationFailed(`Некорректная дата в параметре «${key}»: ${raw}`);
  return parsed;
}

function parseType(raw: string | undefined): AuditEventType | undefined {
  if (raw === undefined) return undefined;
  if (!(AUDIT_EVENT_TYPES as readonly string[]).includes(raw)) {
    throw validationFailed(`Некорректный тип события: «${raw}»`);
  }
  return raw as AuditEventType;
}

/**
 * GET /admin/audit — фильтры «Тип события», «по оператору», «по карточке», период и поиск + пагинация.
 * Ответ — единый формат списков проекта `{ items, total, page, perPage }`.
 */
export function queryAuditLog(params: URLSearchParams): PageResponse<AuditLogEntry> {
  const type = parseType(readStringParam(params, "type"));
  const operator = readStringParam(params, "operator")?.toLowerCase();
  const card = readStringParam(params, "card")?.toLowerCase();
  const text = readStringParam(params, "q")?.toLowerCase();
  const from = parseDate(readStringParam(params, "from"), "from");
  const to = parseDate(readStringParam(params, "to"), "to");
  const { page, perPage } = readPageParams(params);

  const filtered = listAuditLog().filter((entry) => {
    if (type !== undefined && resolveAuditType(entry.action) !== type) return false;
    if (operator !== undefined && !matchesOperator(entry, operator)) return false;
    if (card !== undefined && !entry.cardId?.toLowerCase().includes(card)) return false;
    const at = Date.parse(entry.at);
    if (from !== undefined && at < from) return false;
    if (to !== undefined && at > to) return false;
    if (text !== undefined && !matchesText(entry, text)) return false;
    return true;
  });

  const first = (page - 1) * perPage;
  return { items: filtered.slice(first, first + perPage), total: filtered.length, page, perPage };
}
