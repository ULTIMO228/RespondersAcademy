/*
 * Тестовые помощники сессии мок-слоя: подписанный токен и заголовок Cookie для заданного пользователя store.
 * Роль берётся из store (источник истины), как на бэкенде; `issuedAtMs` позволяет получить уже истёкшую сессию.
 */
import { SESSION_COOKIE } from "@/shared/config";

import { issueSessionToken } from "./auth-tokens";
import { getMockState } from "./store";
import { findStoredUser } from "./store-admin";

export interface SessionCookieOptions {
  /** Момент выдачи, мс с эпохи (по умолчанию — сейчас); давнее значение даёт истёкшую сессию. */
  issuedAtMs?: number;
}

/** Подписанное значение cookie сессии пользователя (регистрирует сессию в реестре). */
export function buildSessionToken(userId: string, options: SessionCookieOptions = {}): string {
  const user = findStoredUser(userId);
  if (!user) throw new Error(`Нет пользователя ${userId} в store мок-слоя`);
  return issueSessionToken(user.id, user.role, options.issuedAtMs ?? Date.now());
}

/** «arm112_session=<токен>» — значение заголовка Cookie запроса. */
export function buildSessionCookie(userId: string, options: SessionCookieOptions = {}): string {
  return `${SESSION_COOKIE}=${buildSessionToken(userId, options)}`;
}

/**
 * Учётка обучающегося с заданным id для тестов, которым нужен свой пользователь на каждый сценарий
 * (изоляция попыток в общем сторе). Уже существующий id не трогает; сбрасывается вместе со стором.
 */
export function ensureTestStudent(userId: string): void {
  const { users } = getMockState();
  if (users.some((user) => user.id === userId)) return;
  users.push({
    id: userId,
    login: userId,
    password: "test-only",
    fullName: "Иванов Сергей Петрович",
    role: "student",
    armNumber: 1,
    isActive: true,
  });
}
