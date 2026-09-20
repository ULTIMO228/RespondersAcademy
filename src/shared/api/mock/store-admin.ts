/*
 * Store: пользователи (isActive), мок-сервисы, настройки и журнал аудита админки.
 * Пароли хранятся только внутри store; наружу пользователей отдавать через toPublicUser.
 */
import type { AuditLogEntry, PublicUser, SystemService, SystemSettings, User } from "../types";
import { cloneOut, getMockState, MOCK_ID_PREFIX, nextMockId } from "./store";
import { nowIso } from "./time";

/** Явная проекция без пароля (PII-гигиена даже в моке). */
export function toPublicUser(user: User): PublicUser {
  const projection: PublicUser & { password?: string } = { ...user };
  delete projection.password;
  return projection;
}

/** Пользователи с паролями — только для логики входа; наружу — toPublicUser. */
export function listStoredUsers(): User[] {
  return cloneOut(getMockState().users);
}

export function findStoredUser(userId: string): User | undefined {
  const user = getMockState().users.find((candidate) => candidate.id === userId);
  return user && cloneOut(user);
}

/** Поиск по логину без учёта регистра — уникальность логина (T4.1-03). */
export function findStoredUserByLogin(login: string): User | undefined {
  const normalized = login.trim().toLowerCase();
  const user = getMockState().users.find((candidate) => candidate.login.toLowerCase() === normalized);
  return user && cloneOut(user);
}

export function updateStoredUser(userId: string, updater: (draft: User) => void): User | undefined {
  const draft = getMockState().users.find((candidate) => candidate.id === userId);
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

/** Новая учётная запись с id "u-NNN" (нумерация продолжает users.json). */
export function insertStoredUser(user: Omit<User, "id">): User {
  const created: User = { id: nextMockId(MOCK_ID_PREFIX.user), ...user };
  getMockState().users.push(created);
  return cloneOut(created);
}

export function listSystemServices(): SystemService[] {
  return cloneOut(getMockState().systemServices);
}

export function updateSystemService(
  serviceId: string,
  updater: (draft: SystemService) => void,
): SystemService | undefined {
  const draft = getMockState().systemServices.find((candidate) => candidate.id === serviceId);
  if (!draft) return undefined;
  updater(draft);
  return cloneOut(draft);
}

export function readSystemSettings(): SystemSettings {
  return cloneOut(getMockState().settings);
}

export function updateSystemSettings(updater: (draft: SystemSettings) => void): SystemSettings {
  const { settings } = getMockState();
  updater(settings);
  return cloneOut(settings);
}

/** Журнал аудита, новые записи — первыми. */
export function listAuditLog(): AuditLogEntry[] {
  return cloneOut(getMockState().auditLog);
}

export type AuditEntryInput = Omit<AuditLogEntry, "id" | "at">;

/** Запись аудита с id "audit-NNN" и ISO-меткой +03:00. */
export function appendAuditEntry(input: AuditEntryInput): AuditLogEntry {
  const entry: AuditLogEntry = { id: nextMockId(MOCK_ID_PREFIX.audit), at: nowIso(), ...input };
  getMockState().auditLog.unshift(entry);
  return cloneOut(entry);
}
