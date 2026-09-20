/*
 * Поиск пользователя по статике mocks/users.json — ТОЛЬКО сервер (public API: index.server.ts),
 * чтобы список учёток с паролями не попадал в клиентский бандл.
 */
import { DEMO_USER_IDS } from "@/shared/config";
import { users } from "@/shared/api";
import type { User, UserRole } from "@/shared/api";

export function findUser(userId: string): User | undefined {
  return users.find((user) => user.id === userId);
}

/** Демо-учётка роли (подсказки на /login, демо-данные экранов без сессии). */
export function getDemoUser(role: UserRole): User {
  const user = findUser(DEMO_USER_IDS[role]);
  if (!user) throw new Error(`Демо-учётка роли ${role} отсутствует в mocks/users.json`);
  return user;
}
