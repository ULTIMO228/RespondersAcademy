/*
 * Данные раздела «Система»: клиент `@/shared/api` (в тестах подменяется реальными route handlers).
 * Экран не знает про fetch и URL — только про этот порт (10-code-rules.md §6).
 */
import { adminSystemApi, listSessions, listUsers } from "@/shared/api";
import type { AdminSystemApi, PublicUser, SessionContract, SessionListQuery } from "@/shared/api";
import type { UserListQuery } from "@/shared/api";

export type SystemApi = AdminSystemApi & {
  /** Состояния занятий — для блокировок во время активного занятия (T4.2-24). */
  listSessions: (query?: SessionListQuery, signal?: AbortSignal) => Promise<SessionContract[]>;
  /** Реестр пользователей — ФИО и № АРМ в строках журнала аудита (T4.2-22). */
  listUsers: (query?: UserListQuery, signal?: AbortSignal) => Promise<PublicUser[]>;
};

export const defaultSystemApi: SystemApi = { ...adminSystemApi, listSessions, listUsers };
